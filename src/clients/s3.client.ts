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
import { join } from 'path';
import { config } from '../config.js';
import { isLambda } from '../utils/runtime.util.js';

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
      const input: GetObjectCommandInput = {
        Bucket: this.bucketName,
        Key: key,
      };

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
      const buffer = Buffer.concat(chunks);
      return buffer;
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
      await this.s3Client.send(
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
  }

  async listObjects(prefix: string, maxKeys?: number): Promise<string[]> {
    if (!this.s3Client || !this.bucketName) {
      return [];
    }

    const result = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      })
    );

    const keys = result.Contents?.map(obj => obj.Key ?? '').filter(Boolean) ?? [];
    return keys;
  }

  async delete(key: string): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client not initialized. Check AWS_S3_BUCKET and AWS_REGION environment variables.');
    }

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })
    );
  }
}

const s3Client = new S3ClientWrapper();
export default s3Client;

export class FileStorage {
  private readonly basePath: string;
  private readonly isLambda: boolean;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.isLambda = isLambda();
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
    if (!this.isLambda || !s3Client.isAvailable()) {
      return;
    }

    if (!existsSync(localPath)) {
      return;
    }

    const syncDirectory = async (dirPath: string, relativePath: string = ''): Promise<void> => {
      const files = readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stat = statSync(filePath);
        const currentRelativePath = relativePath ? `${relativePath}/${file}` : file;
        
        if (stat.isDirectory()) {
          await syncDirectory(filePath, currentRelativePath);
        } else {
          const fileContent = readFileSync(filePath);
          const s3Key = `${this.basePath}/${currentRelativePath}`;
          await s3Client.upload(s3Key, fileContent);
        }
      }
    };

    await syncDirectory(localPath);
  }

  async syncFromS3(localPath: string): Promise<void> {
    if (!this.isLambda || !s3Client.isAvailable()) {
      return;
    }

    if (!existsSync(localPath)) {
      mkdirSync(localPath, { recursive: true });
    }

    // List all objects in S3 with the basePath prefix
    const s3Keys = await s3Client.listObjects(this.basePath);
    
    for (const s3Key of s3Keys) {
      // Extract relative path from S3 key (remove basePath prefix)
      const relativePath = s3Key.startsWith(`${this.basePath}/`) 
        ? s3Key.slice(this.basePath.length + 1)
        : s3Key;
      
      // Skip if it's just the base path itself
      if (!relativePath || relativePath === this.basePath) {
        continue;
      }
      
      const localFilePath = join(localPath, relativePath);
      const localFileDir = join(localFilePath, '..');
      
      // Create directory structure if needed
      if (!existsSync(localFileDir)) {
        mkdirSync(localFileDir, { recursive: true });
      }
      
      // Download file from S3
      const fileContent = await s3Client.download(s3Key);
      if (fileContent) {
        writeFileSync(localFilePath, fileContent);
      }
    }
  }
}

