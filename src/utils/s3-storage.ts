/**
 * S3 Storage Utility
 * 
 * Handles session storage for WhatsApp in Lambda environment
 * Supports both local filesystem (development) and S3 (Lambda)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
import { config } from '../config.js';

/**
 * Check if running in Lambda environment
 */
function isLambdaEnvironment(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

/**
 * S3 storage client wrapper
 */
class S3Storage {
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

  /**
   * Upload file to S3
   */
  async upload(key: string, data: Buffer | string, contentType?: string): Promise<void> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client not initialized. Check AWS_S3_BUCKET and AWS_REGION environment variables.');
    }

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: typeof data === 'string' ? Buffer.from(data) : data,
          ContentType: contentType ?? 'application/octet-stream',
        })
      );
      logger.debug('File uploaded to S3', { key, bucket: this.bucketName });
    } catch (error) {
      logger.error('Error uploading file to S3', error, { key, bucket: this.bucketName });
      throw error;
    }
  }

  /**
   * Download file from S3
   */
  async download(key: string): Promise<Buffer | null> {
    if (!this.s3Client || !this.bucketName) {
      return null;
    }

    try {
      const result = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );

      if (!result.Body) {
        return null;
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      if (result.Body && typeof result.Body === 'object' && Symbol.asyncIterator in result.Body) {
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
      }
      const buffer = Buffer.concat(chunks);

      logger.debug('File downloaded from S3', { key, bucket: this.bucketName, size: buffer.length });
      return buffer;
    } catch (error: unknown) {
      const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (awsError.name === 'NoSuchKey' || awsError.$metadata?.httpStatusCode === 404) {
        logger.debug('File not found in S3', { key, bucket: this.bucketName });
        return null;
      }
      logger.error('Error downloading file from S3', error, { key, bucket: this.bucketName });
      throw error;
    }
  }

  /**
   * Check if file exists in S3
   */
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
      logger.error('Error checking file existence in S3', error, { key, bucket: this.bucketName });
      return false;
    }
  }

  /**
   * Upload directory recursively to S3
   */
  async uploadDirectory(localPath: string, s3Prefix: string): Promise<void> {
    // This is a simplified implementation
    // In production, you'd want to recursively upload all files
    const { readdirSync, statSync } = await import('fs');
    
    try {
      const files = readdirSync(localPath);
      for (const file of files) {
        const filePath = join(localPath, file);
        const stat = statSync(filePath);
        
        if (stat.isDirectory()) {
          await this.uploadDirectory(filePath, `${s3Prefix}/${file}`);
        } else {
          const fileContent = readFileSync(filePath);
          await this.upload(`${s3Prefix}/${file}`, fileContent);
        }
      }
    } catch (error) {
      logger.error('Error uploading directory to S3', error, { localPath, s3Prefix });
      throw error;
    }
  }

  /**
   * Download directory from S3 to local path
   */
  async downloadDirectory(s3Prefix: string, localPath: string): Promise<void> {
    // This is a simplified implementation
    // In production, you'd use S3 list operations to get all files
    const { mkdirSync } = await import('fs');
    
    if (!existsSync(localPath)) {
      mkdirSync(localPath, { recursive: true });
    }

    // For now, we'll handle individual file downloads as needed
    // Full directory sync would require S3 ListObjectsV2
    logger.debug('Directory download not fully implemented - use individual file downloads', {
      s3Prefix,
      localPath,
    });
  }
}

/**
 * File storage abstraction
 * Handles both local filesystem and S3 based on environment
 */
class FileStorage {
  private s3Storage: S3Storage;
  private readonly basePath: string;
  private readonly isLambda: boolean;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.isLambda = isLambdaEnvironment();
    this.s3Storage = new S3Storage();
  }

  /**
   * Read file (from S3 in Lambda, local filesystem otherwise)
   */
  async readFile(filePath: string): Promise<Buffer | null> {
    if (this.isLambda && this.s3Storage) {
      const s3Key = `${this.basePath}/${filePath}`;
      return await this.s3Storage.download(s3Key);
    }

    // Local filesystem
    const fullPath = join(process.cwd(), this.basePath, filePath);
    if (!existsSync(fullPath)) {
      return null;
    }
    return readFileSync(fullPath);
  }

  /**
   * Write file (to S3 in Lambda, local filesystem otherwise)
   */
  async writeFile(filePath: string, data: Buffer | string): Promise<void> {
    if (this.isLambda && this.s3Storage) {
      const s3Key = `${this.basePath}/${filePath}`;
      await this.s3Storage.upload(s3Key, data);
      return;
    }

    // Local filesystem
    const fullPath = join(process.cwd(), this.basePath, filePath);
    const dir = join(fullPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, data);
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    if (this.isLambda && this.s3Storage) {
      const s3Key = `${this.basePath}/${filePath}`;
      return await this.s3Storage.exists(s3Key);
    }

    // Local filesystem
    const fullPath = join(process.cwd(), this.basePath, filePath);
    return existsSync(fullPath);
  }

  /**
   * Sync directory from local to S3 (for Lambda)
   */
  async syncToS3(localPath: string): Promise<void> {
    if (!this.isLambda) {
      return; // No-op for local
    }

    const s3Prefix = this.basePath;
    await this.s3Storage.uploadDirectory(localPath, s3Prefix);
  }

  /**
   * Sync directory from S3 to local (for Lambda)
   */
  async syncFromS3(localPath: string): Promise<void> {
    if (!this.isLambda) {
      return; // No-op for local
    }

    const s3Prefix = this.basePath;
    await this.s3Storage.downloadDirectory(s3Prefix, localPath);
  }
}

/**
 * Create file storage instance for WhatsApp session
 */
export function createWhatsAppSessionStorage(): FileStorage {
  return new FileStorage('.wwebjs_auth');
}

