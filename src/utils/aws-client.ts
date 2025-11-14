/**
 * AWS Client Utilities
 * 
 * Centralized AWS SDK v3 client initialization
 * Provides clients for CloudWatch, S3, X-Ray
 * 
 * Note: DynamoDB removed - using S3 instead (cheaper for once-a-day script)
 */

import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

/**
 * Check if running in Lambda environment
 */
export function isLambdaEnvironment(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

/**
 * Get AWS region
 */
export function getAWSRegion(): string {
  return config.aws?.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
}

/**
 * Create CloudWatch Logs client
 */
export function createCloudWatchLogsClient(): CloudWatchLogsClient {
  return new CloudWatchLogsClient({
    region: getAWSRegion(),
  });
}

/**
 * Create CloudWatch Metrics client
 */
export function createCloudWatchClient(): CloudWatchClient {
  return new CloudWatchClient({
    region: getAWSRegion(),
  });
}

/**
 * Create S3 client
 */
export function createS3Client(): S3Client {
  return new S3Client({
    region: getAWSRegion(),
  });
}


