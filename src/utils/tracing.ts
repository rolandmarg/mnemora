/**
 * X-Ray Tracing Integration
 * 
 * Provides X-Ray tracing support for AWS Lambda
 * Creates segments and subsegments for major operations
 */

import * as AWSXRay from 'aws-xray-sdk-core';
import { logger } from './logger.js';
import { config } from '../config.js';

/**
 * Check if X-Ray is enabled
 */
function isXRayEnabled(): boolean {
  return config.aws?.enableXRay !== false && !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

/**
 * Initialize X-Ray tracing
 */
export function initializeTracing(): void {
  if (!isXRayEnabled()) {
    return;
  }

  try {
    // X-Ray is automatically enabled in Lambda via the X-Ray layer
    // This function is for manual initialization if needed
    logger.debug('X-Ray tracing enabled');
  } catch (error) {
    logger.warn('Failed to initialize X-Ray tracing', error);
  }
}

/**
 * Create a segment for an operation
 */
export async function traceSegment<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!isXRayEnabled()) {
    return operation();
  }

  try {
    return await AWSXRay.captureAsyncFunc(name, async (subsegment) => {
      try {
        const result = await operation();
        if (subsegment) {
          subsegment.close();
        }
        return result;
      } catch (error) {
        if (subsegment) {
          subsegment.addError(error instanceof Error ? error : new Error(String(error)));
          subsegment.close();
        }
        throw error;
      }
    });
  } catch (error) {
    // If tracing fails, still execute the operation
    logger.warn('X-Ray tracing failed, continuing without trace', error);
    return operation();
  }
}

/**
 * Create a subsegment for a nested operation
 */
export async function traceSubsegment<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!isXRayEnabled()) {
    return operation();
  }

  try {
    const segment = AWSXRay.getSegment();
    if (!segment) {
      return operation();
    }

    const subsegment = segment.addNewSubsegment(name);
    try {
      const result = await operation();
      subsegment.close();
      return result;
    } catch (error) {
      subsegment.addError(error instanceof Error ? error : new Error(String(error)));
      subsegment.close();
      throw error;
    }
  } catch (error) {
    logger.warn('X-Ray subsegment creation failed, continuing without trace', error);
    return operation();
  }
}

/**
 * Add annotation to current segment
 */
export function addAnnotation(key: string, value: string | number | boolean): void {
  if (!isXRayEnabled()) {
    return;
  }

  try {
    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addAnnotation(key, value);
    }
  } catch (_error) {
    // Ignore errors - tracing is non-critical
  }
}

/**
 * Add metadata to current segment
 */
export function addMetadata(key: string, value: unknown): void {
  if (!isXRayEnabled()) {
    return;
  }

  try {
    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addMetadata(key, value);
    }
  } catch (_error) {
    // Ignore errors - tracing is non-critical
  }
}

