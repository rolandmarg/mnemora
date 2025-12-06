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
import { isLambda } from '../utils/runtime.util.js';
import xrayClient from './xray.client.js';

class S3ClientWrapper {
  private s3Client: S3Client | null = null;
  private readonly bucketName: string | undefined;
  private readonly isLambda: boolean;

  constructor() {
    this.isLambda = isLambda();
    this.bucketName = config.aws.s3Bucket;

    const region = config.aws.region;
    if (this.isLambda && this.bucketName && region) {
      this.s3Client = new S3Client({
        region,
      });
    }
  }

  isAvailable(): boolean {
    return this.s3Client !== null && this.bucketName !== undefined;
  }

  async upload(
    key: string,
    data: Buffer | string,
    contentType?: string
  ): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client not initialized. Check AWS_S3_BUCKET and AWS_REGION environment variables.');
    }

    return xrayClient.captureAsyncSegment('S3.upload', async () => {
      const input: PutObjectCommandInput = {
        Bucket: this.bucketName,
        Key: key,
        Body: typeof data === 'string' ? Buffer.from(data) : data,
        ContentType: contentType ?? 'application/octet-stream',
      };

      await this.s3Client!.send(new PutObjectCommand(input));
    }, {
      bucket: this.bucketName,
      key,
      contentType: contentType ?? 'application/octet-stream',
      dataSize: typeof data === 'string' ? data.length : data.length,
    });
  }

  async download(key: string): Promise<Buffer | null> {
    if (!this.s3Client || !this.bucketName) {
      return null;
    }

    return xrayClient.captureAsyncSegment('S3.download', async () => {
      try {
        const input: GetObjectCommandInput = {
          Bucket: this.bucketName,
          Key: key,
        };

        const result = await this.s3Client!.send(new GetObjectCommand(input));

        if (!result.Body) {
          return null;
        }

        const chunks: Uint8Array[] = [];
        if (result.Body && typeof result.Body === 'object' && Symbol.asyncIterator in result.Body) {
          for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
          }
        }
        const buffer = Buffer.concat(chunks);
        return buffer;
      } catch (error: unknown) {
        const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (awsError.name === 'NoSuchKey' || awsError.$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw error;
      }
    }, {
      bucket: this.bucketName,
      key,
    });
  }

  async exists(key: string): Promise<boolean> {
    if (!this.s3Client || !this.bucketName) {
      return false;
    }

    return xrayClient.captureAsyncSegment('S3.exists', async () => {
      try {
        await this.s3Client!.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          })
        );
        return true;
      } catch (error: unknown) {
        const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (awsError.name === 'NotFound' || awsError.$metadata?.httpStatusCode === 404) {
          return false;
        }
        return false;
      }
    }, {
      bucket: this.bucketName,
      key,
    });
  }

  async listObjects(prefix: string, maxKeys?: number): Promise<string[]> {
    if (!this.s3Client || !this.bucketName) {
      return [];
    }

    return xrayClient.captureAsyncSegment('S3.listObjects', async () => {
      const result = await this.s3Client!.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          MaxKeys: maxKeys,
        })
      );

      const keys = result.Contents?.map(obj => obj.Key ?? '').filter(Boolean) ?? [];
      return keys;
    }, {
      bucket: this.bucketName,
      prefix,
      maxKeys: maxKeys ?? 'unlimited',
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client not initialized. Check AWS_S3_BUCKET and AWS_REGION environment variables.');
    }

    return xrayClient.captureAsyncSegment('S3.delete', async () => {
      await this.s3Client!.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );
    }, {
      bucket: this.bucketName,
      key,
    });
  }
}

const s3Client = new S3ClientWrapper();
export default s3Client;

interface SyncMetadata {
  files: Record<string, { hash: string; mtime: number }>;
  lastSyncTime: number;
}

export class FileStorage {
  private readonly basePath: string;
  private readonly isLambda: boolean;
  private readonly METADATA_KEY = '.sync-metadata.json';
  private readonly isSessionStorage: boolean;
  private readonly ARCHIVE_NAME = 'session.tar.gz';
  private readonly DOWNLOAD_BATCH_SIZE = 20;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.isLambda = isLambda();
    this.isSessionStorage = basePath === 'auth_info';
  }

  /**
   * Compute SHA-256 hash of file content
   */
  private getFileHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Create a gzipped tar archive of the given local directory.
   * Used for WhatsApp session storage (auth_info).
   */
  private async createSessionArchive(localPath: string): Promise<Buffer> {
    const archivePath = `/tmp/mnemora-${this.basePath}.tar.gz`;

    await tar.create(
      {
        gzip: true,
        file: archivePath,
        cwd: localPath,
      },
      ['.']
    );

    return readFileSync(archivePath);
  }

  /**
   * Extract a gzipped tar archive buffer into the given local directory.
   * Used for WhatsApp session storage (auth_info).
   */
  private async extractSessionArchive(localPath: string, archiveBuffer: Buffer): Promise<void> {
    const archivePath = `/tmp/mnemora-${this.basePath}.tar.gz`;
    writeFileSync(archivePath, archiveBuffer);

    try {
      await tar.extract({
        file: archivePath,
        cwd: localPath,
      });
    } catch (error) {
      throw new Error(
        `Failed to extract WhatsApp session archive from S3: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Load sync metadata from S3
   */
  private async loadSyncMetadata(): Promise<SyncMetadata | null> {
    if (!this.isLambda || !s3Client.isAvailable()) {
      return null;
    }

    try {
      const metadataKey = `${this.basePath}/${this.METADATA_KEY}`;
      const metadataContent = await s3Client.download(metadataKey);
      if (metadataContent) {
        return JSON.parse(metadataContent.toString()) as SyncMetadata;
      }
    } catch (_error) {
      // Metadata doesn't exist yet (first sync) - this is expected
    }
    return null;
  }

  /**
   * Save sync metadata to S3
   */
  private async saveSyncMetadata(metadata: SyncMetadata): Promise<void> {
    if (!this.isLambda || !s3Client.isAvailable()) {
      return;
    }

    const metadataKey = `${this.basePath}/${this.METADATA_KEY}`;
    const metadataJson = JSON.stringify(metadata, null, 2);
    await s3Client.upload(metadataKey, metadataJson, 'application/json');
  }

  async readFile(filePath: string): Promise<Buffer | null> {
    if (this.isLambda && s3Client.isAvailable()) {
      const s3Key = `${this.basePath}/${filePath}`;
      return await s3Client.download(s3Key);
    }

    const fullPath = join(process.cwd(), this.basePath, filePath);
    if (!existsSync(fullPath)) {
      return null;
    }
    return readFileSync(fullPath);
  }

  async writeFile(filePath: string, data: Buffer | string): Promise<void> {
    if (this.isLambda && s3Client.isAvailable()) {
      const s3Key = `${this.basePath}/${filePath}`;
      await s3Client.upload(s3Key, data);
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
    if (this.isLambda && s3Client.isAvailable()) {
      const s3Key = `${this.basePath}/${filePath}`;
      return await s3Client.exists(s3Key);
    }

    const fullPath = join(process.cwd(), this.basePath, filePath);
    return existsSync(fullPath);
  }

  async syncToS3(localPath: string): Promise<void> {
    // Allow sync from both Lambda and local if S3 is configured
    if (!s3Client.isAvailable()) {
      return;
    }

    return xrayClient.captureAsyncSegment('FileStorage.syncToS3', async () => {
      if (!existsSync(localPath)) {
        return;
      }

      if (this.isSessionStorage) {
        const archiveBuffer = await this.createSessionArchive(localPath);
        const archiveKey = `${this.basePath}/${this.ARCHIVE_NAME}`;
        await s3Client.upload(archiveKey, archiveBuffer, 'application/gzip');
        return;
      }

      // Legacy incremental sync for non-session storage
      // Only sync files modified within the last 30 days to avoid old data
      const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      const now = Date.now();

      const previousMetadata = await this.loadSyncMetadata();
      const currentFiles: Record<string, { hash: string; mtime: number }> = {};
      const filesToUpload: Array<{ s3Key: string; content: Buffer }> = [];

      const collectFiles = (dirPath: string, relativePath: string = ''): void => {
        const files = readdirSync(dirPath);

        for (const file of files) {
          const filePath = join(dirPath, file);
          const stat = statSync(filePath);
          const currentRelativePath = relativePath ? `${relativePath}/${file}` : file;

          if (currentRelativePath === this.METADATA_KEY) {
            continue;
          }

          if (stat.isDirectory()) {
            collectFiles(filePath, currentRelativePath);
          } else {
            const fileAge = now - stat.mtimeMs;

            if (fileAge > MAX_AGE_MS) {
              continue;
            }

            const fileContent = readFileSync(filePath);
            const hash = this.getFileHash(fileContent);
            const mtime = stat.mtimeMs;
            const s3Key = `${this.basePath}/${currentRelativePath}`;

            currentFiles[currentRelativePath] = { hash, mtime };

            const previousFile = previousMetadata?.files[currentRelativePath];
            const needsUpload = !previousFile ||
              previousFile?.hash !== hash ||
              previousFile?.mtime !== mtime;

            if (needsUpload) {
              filesToUpload.push({ s3Key, content: fileContent });
            }
          }
        }
      };

      collectFiles(localPath);

      if (filesToUpload.length > 0) {
        const BATCH_SIZE = 10;
        for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
          const batch = filesToUpload.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(({ s3Key, content }) => s3Client.upload(s3Key, content))
          );
        }
      }

      const newMetadata: SyncMetadata = {
        files: currentFiles,
        lastSyncTime: Date.now(),
      };
      await this.saveSyncMetadata(newMetadata);
    }, {
      basePath: this.basePath,
      localPath,
    });
  }

  async syncFromS3(localPath: string): Promise<void> {
    if (!this.isLambda || !s3Client.isAvailable()) {
      return;
    }

    return xrayClient.captureAsyncSegment('FileStorage.syncFromS3', async () => {
      if (!existsSync(localPath)) {
        mkdirSync(localPath, { recursive: true });
      }

      if (this.isSessionStorage) {
        const archiveKey = `${this.basePath}/${this.ARCHIVE_NAME}`;
        const existsInS3 = await s3Client.exists(archiveKey);

        if (!existsInS3) {
          throw new Error('WhatsApp session archive not found in S3');
        }

        const archiveBuffer = await s3Client.download(archiveKey);
        if (!archiveBuffer) {
          throw new Error('WhatsApp session archive is empty or unreadable in S3');
        }

        await this.extractSessionArchive(localPath, archiveBuffer);
        return;
      }

      // Legacy behavior for non-session storage: list and download all objects under basePath
      const s3Keys = await s3Client.listObjects(this.basePath);

      const downloadTasks: Array<{ s3Key: string; localFilePath: string; localFileDir: string }> = [];

      for (const s3Key of s3Keys) {
        const relativePath = s3Key.startsWith(`${this.basePath}/`)
          ? s3Key.slice(this.basePath.length + 1)
          : s3Key;

        if (!relativePath || relativePath === this.basePath) {
          continue;
        }

        const localFilePath = join(localPath, relativePath);
        const localFileDir = join(localFilePath, '..');

        downloadTasks.push({ s3Key, localFilePath, localFileDir });
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
    }, {
      basePath: this.basePath,
      localPath,
    });
  }
}

