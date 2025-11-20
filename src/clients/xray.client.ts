import * as AWSXRay from 'aws-xray-sdk-core';
import { config } from '../config.js';

/**
 * X-Ray Client
 * 
 * Provides X-Ray tracing functionality for AWS Lambda.
 * Wraps the AWS X-Ray SDK to provide a consistent interface for creating
 * subsegments and adding annotations/metadata to traces.
 */
class XRayClient {
  /**
   * Checks if X-Ray tracing is enabled
   */
  isEnabled(): boolean {
    return config.aws.enableXRay && !!process.env._X_AMZN_TRACE_ID;
  }

  /**
   * Gets the current X-Ray segment
   */
  private getSegment(): AWSXRay.Segment | undefined {
    if (!this.isEnabled()) {
      return undefined;
    }
    return AWSXRay.getSegment();
  }

  /**
   * Creates a subsegment for an async operation
   */
  async captureAsyncSegment<T>(
    name: string,
    operation: (subsegment: AWSXRay.Subsegment) => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    if (!this.isEnabled()) {
      // If X-Ray is disabled, just run the operation without tracing
      const dummySubsegment = {} as AWSXRay.Subsegment;
      return operation(dummySubsegment);
    }

    const segment = this.getSegment();
    if (!segment) {
      // No segment available, run without tracing
      const dummySubsegment = {} as AWSXRay.Subsegment;
      return operation(dummySubsegment);
    }

    const subsegment = segment.addNewSubsegment(name);
    
    try {
      // Add metadata if provided
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          subsegment.addMetadata(key, value);
        });
      }

      const result = await operation(subsegment);
      subsegment.close();
      return result;
    } catch (error) {
      subsegment.addError(error instanceof Error ? error : new Error(String(error)));
      subsegment.close();
      throw error;
    }
  }

  /**
   * Creates a subsegment for a sync operation
   */
  captureSyncSegment<T>(
    name: string,
    operation: (subsegment: AWSXRay.Subsegment) => T,
    metadata?: Record<string, unknown>
  ): T {
    if (!this.isEnabled()) {
      // If X-Ray is disabled, just run the operation without tracing
      const dummySubsegment = {} as AWSXRay.Subsegment;
      return operation(dummySubsegment);
    }

    const segment = this.getSegment();
    if (!segment) {
      // No segment available, run without tracing
      const dummySubsegment = {} as AWSXRay.Subsegment;
      return operation(dummySubsegment);
    }

    const subsegment = segment.addNewSubsegment(name);
    
    try {
      // Add metadata if provided
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          subsegment.addMetadata(key, value);
        });
      }

      const result = operation(subsegment);
      subsegment.close();
      return result;
    } catch (error) {
      subsegment.addError(error instanceof Error ? error : new Error(String(error)));
      subsegment.close();
      throw error;
    }
  }

  /**
   * Adds annotation to current segment
   */
  addAnnotation(key: string, value: string | number | boolean): void {
    if (!this.isEnabled()) {
      return;
    }

    const segment = this.getSegment();
    if (segment) {
      segment.addAnnotation(key, value);
    }
  }

  /**
   * Adds metadata to current segment
   */
  addMetadata(key: string, value: unknown): void {
    if (!this.isEnabled()) {
      return;
    }

    const segment = this.getSegment();
    if (segment) {
      segment.addMetadata(key, value);
    }
  }
}

const xrayClient = new XRayClient();
export default xrayClient;


