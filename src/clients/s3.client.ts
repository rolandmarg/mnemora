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
import { isLambdaEnvironment } from '../utils/env.util.js';

class S3ClientWrapper {
  private s3Client: S3Client | null = null;
  private readonly bucketName: string | undefined;
  private readonly isLambda: boolean;

  constructor() {
    this.isLambda = isLambdaEnvironment();
    this.bucketName = config.aws?.s3Bucket;

    if (this.isLambda && this.bucketName && config.aws?.region) {
      this.s3Client = new S3Client({
        region: config.aws.region,
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

  /**
   * Delete object from S3
   */
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
    this.isLambda = isLambdaEnvironment();
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

    try {
      const files = readdirSync(localPath);
      await files.reduce(async (promise, file) => {
        await promise;
        const filePath = join(localPath, file);
        const stat = statSync(filePath);
        
        if (stat.isDirectory()) {
          await this.syncToS3(filePath);
        } else {
          const fileContent = readFileSync(filePath);
          const s3Key = `${this.basePath}/${file}`;
          await s3Client.upload(s3Key, fileContent);
        }
      }, Promise.resolve());
    } catch (error) {
      throw error;
    }
  }

  async syncFromS3(localPath: string): Promise<void> {
    if (!this.isLambda || !s3Client.isAvailable()) {
      return;
    }

    if (!existsSync(localPath)) {
      mkdirSync(localPath, { recursive: true });
    }

    // Simplified implementation - full directory sync would require S3 ListObjectsV2
    // For now, individual file downloads are handled as needed
  }
}


