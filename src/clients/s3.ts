import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
} from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import tar from 'tar';
import { createHash } from 'crypto';
import { join } from 'path';
import { config } from '../config.js';

class S3ClientWrapper {
  private s3Client: S3Client | null = null;
  private readonly bucketName: string | undefined;

  constructor() {
    this.bucketName = config.aws.s3Bucket;
    const region = config.aws.region;
    if (this.bucketName && region) {
      this.s3Client = new S3Client({ region });
    }
  }

  isAvailable(): boolean {
    return this.s3Client !== null && this.bucketName !== undefined;
  }

  async upload(key: string, data: Buffer | string, contentType?: string): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client not initialized. Check AWS_S3_BUCKET and AWS_REGION environment variables.');
    }

    const input: PutObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
      Body: typeof data === 'string' ? Buffer.from(data) : data,
      ContentType: contentType ?? 'application/octet-stream',
    };

    await this.s3Client.send(new PutObjectCommand(input));
  }

  async download(key: string): Promise<Buffer | null> {
    if (!this.s3Client || !this.bucketName) {
return null;
}

    try {
      const input: GetObjectCommandInput = { Bucket: this.bucketName, Key: key };
      const result = await this.s3Client.send(new GetObjectCommand(input));
      if (!result.Body) {
return null;
}

      const chunks: Uint8Array[] = [];
      if (result.Body && typeof result.Body === 'object' && Symbol.asyncIterator in result.Body) {
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
      }
      return Buffer.concat(chunks);
    } catch (error: unknown) {
      const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (awsError.name === 'NoSuchKey' || awsError.$metadata?.httpStatusCode === 404) {
return null;
}
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.s3Client || !this.bucketName) {
return false;
}

    try {
      await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async listObjects(prefix: string, maxKeys?: number): Promise<string[]> {
    if (!this.s3Client || !this.bucketName) {
return [];
}

    const result = await this.s3Client.send(
      new ListObjectsV2Command({ Bucket: this.bucketName, Prefix: prefix, MaxKeys: maxKeys })
    );
    return result.Contents?.map(obj => obj.Key ?? '').filter(Boolean) ?? [];
  }

  async delete(key: string): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client not initialized. Check AWS_S3_BUCKET and AWS_REGION environment variables.');
    }
    await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
  }
}

const s3Client = new S3ClientWrapper();

interface SyncMetadata {
  files: Record<string, { hash: string; mtime: number }>;
  lastSyncTime: number;
}

export class FileStorage {
  private readonly basePath: string;
  private readonly METADATA_KEY = '.sync-metadata.json';
  private readonly isSessionStorage: boolean;
  private readonly ARCHIVE_NAME = 'session.tar.gz';
  private readonly DOWNLOAD_BATCH_SIZE = 20;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.isSessionStorage = basePath === 'auth_info';
  }

  private getFileHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async createSessionArchive(localPath: string): Promise<Buffer> {
    const archivePath = `/tmp/mnemora-${this.basePath}.tar.gz`;
    await tar.create({ gzip: true, file: archivePath, cwd: localPath }, ['.']);
    return readFileSync(archivePath);
  }

  private async extractSessionArchive(localPath: string, archiveBuffer: Buffer): Promise<void> {
    const archivePath = `/tmp/mnemora-${this.basePath}.tar.gz`;
    writeFileSync(archivePath, archiveBuffer);
    try {
      await tar.extract({ file: archivePath, cwd: localPath });
    } catch (error) {
      throw new Error(
        `Failed to extract WhatsApp session archive from S3: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async loadSyncMetadata(): Promise<SyncMetadata | null> {
    if (!s3Client.isAvailable()) {
return null;
}
    try {
      const content = await s3Client.download(`${this.basePath}/${this.METADATA_KEY}`);
      if (content) {
return JSON.parse(content.toString()) as SyncMetadata;
}
    } catch { /* first sync */ }
    return null;
  }

  private async saveSyncMetadata(metadata: SyncMetadata): Promise<void> {
    if (!s3Client.isAvailable()) {
return;
}
    await s3Client.upload(`${this.basePath}/${this.METADATA_KEY}`, JSON.stringify(metadata, null, 2), 'application/json');
  }

  async readFile(filePath: string): Promise<Buffer | null> {
    if (s3Client.isAvailable()) {
      return await s3Client.download(`${this.basePath}/${filePath}`);
    }
    const fullPath = join(process.cwd(), this.basePath, filePath);
    if (!existsSync(fullPath)) {
return null;
}
    return readFileSync(fullPath);
  }

  async writeFile(filePath: string, data: Buffer | string): Promise<void> {
    if (s3Client.isAvailable()) {
      await s3Client.upload(`${this.basePath}/${filePath}`, data);
      return;
    }
    const fullPath = join(process.cwd(), this.basePath, filePath);
    const dir = join(fullPath, '..');
    if (!existsSync(dir)) {
mkdirSync(dir, { recursive: true });
}
    writeFileSync(fullPath, data);
  }

  async fileExists(filePath: string): Promise<boolean> {
    if (s3Client.isAvailable()) {
      return await s3Client.exists(`${this.basePath}/${filePath}`);
    }
    return existsSync(join(process.cwd(), this.basePath, filePath));
  }

  async syncToS3(localPath: string): Promise<void> {
    if (!s3Client.isAvailable() || !existsSync(localPath)) {
return;
}

    if (this.isSessionStorage) {
      const archiveBuffer = await this.createSessionArchive(localPath);
      await s3Client.upload(`${this.basePath}/${this.ARCHIVE_NAME}`, archiveBuffer, 'application/gzip');
      return;
    }

    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const previousMetadata = await this.loadSyncMetadata();
    const currentFiles: Record<string, { hash: string; mtime: number }> = {};
    const filesToUpload: Array<{ s3Key: string; content: Buffer }> = [];

    const collectFiles = (dirPath: string, relativePath: string = ''): void => {
      for (const file of readdirSync(dirPath)) {
        const filePath = join(dirPath, file);
        const stat = statSync(filePath);
        const currentRelativePath = relativePath ? `${relativePath}/${file}` : file;

        if (currentRelativePath === this.METADATA_KEY) {
continue;
}

        if (stat.isDirectory()) {
          collectFiles(filePath, currentRelativePath);
        } else {
          if (now - stat.mtimeMs > MAX_AGE_MS) {
continue;
}

          const fileContent = readFileSync(filePath);
          const hash = this.getFileHash(fileContent);
          currentFiles[currentRelativePath] = { hash, mtime: stat.mtimeMs };

          const previousFile = previousMetadata?.files[currentRelativePath];
          if (previousFile?.hash !== hash || previousFile.mtime !== stat.mtimeMs) {
            filesToUpload.push({ s3Key: `${this.basePath}/${currentRelativePath}`, content: fileContent });
          }
        }
      }
    };

    collectFiles(localPath);

    for (let i = 0; i < filesToUpload.length; i += 10) {
      const batch = filesToUpload.slice(i, i + 10);
      await Promise.all(batch.map(({ s3Key, content }) => s3Client.upload(s3Key, content)));
    }

    await this.saveSyncMetadata({ files: currentFiles, lastSyncTime: Date.now() });
  }

  async syncFromS3(localPath: string): Promise<void> {
    if (!s3Client.isAvailable()) {
return;
}

    if (!existsSync(localPath)) {
mkdirSync(localPath, { recursive: true });
}

    if (this.isSessionStorage) {
      const archiveKey = `${this.basePath}/${this.ARCHIVE_NAME}`;
      if (!(await s3Client.exists(archiveKey))) {
        throw new Error('WhatsApp session archive not found in S3');
      }
      const archiveBuffer = await s3Client.download(archiveKey);
      if (!archiveBuffer) {
throw new Error('WhatsApp session archive is empty or unreadable in S3');
}
      await this.extractSessionArchive(localPath, archiveBuffer);
      return;
    }

    const s3Keys = await s3Client.listObjects(this.basePath);
    const downloadTasks: Array<{ s3Key: string; localFilePath: string; localFileDir: string }> = [];

    for (const s3Key of s3Keys) {
      const relativePath = s3Key.startsWith(`${this.basePath}/`) ? s3Key.slice(this.basePath.length + 1) : s3Key;
      if (!relativePath || relativePath === this.basePath) {
continue;
}
      const localFilePath = join(localPath, relativePath);
      downloadTasks.push({ s3Key, localFilePath, localFileDir: join(localFilePath, '..') });
    }

    for (let i = 0; i < downloadTasks.length; i += this.DOWNLOAD_BATCH_SIZE) {
      const batch = downloadTasks.slice(i, i + this.DOWNLOAD_BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ s3Key, localFilePath, localFileDir }) => {
          if (!existsSync(localFileDir)) {
mkdirSync(localFileDir, { recursive: true });
}
          const fileContent = await s3Client.download(s3Key);
          if (fileContent) {
writeFileSync(localFilePath, fileContent);
}
        })
      );
    }
  }
}
