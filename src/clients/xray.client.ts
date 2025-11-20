import { Tracer } from '@aws-lambda-powertools/tracer';
import { config } from '../config.js';

interface SubsegmentLike {
  addMetadata(key: string, value: unknown): void;
  addError(error: Error): void;
  close(): void;
}

/**
 * X-Ray Client
 * 
 * Provides X-Ray tracing functionality for AWS Lambda.
 * Wraps AWS Lambda Powertools Tracer to provide a consistent interface for creating
 * subsegments and adding annotations/metadata to traces.
 */
class XRayClient {
  private tracer: Tracer;

  constructor() {
    this.tracer = new Tracer({
      serviceName: 'mnemora',
      enabled: config.aws.enableXRay,
    });
  }

  /**
   * Checks if X-Ray tracing is enabled
   */
  isEnabled(): boolean {
    return config.aws.enableXRay && !!process.env._X_AMZN_TRACE_ID;
  }

  /**
   * Gets the current X-Ray segment
   */
  private getSegment() {
    if (!this.isEnabled()) {
      return undefined;
    }
    return this.tracer.getSegment();
  }

  /**
   * Creates a subsegment for an async operation
   */
  async captureAsyncSegment<T>(
    name: string,
    operation: (subsegment: SubsegmentLike) => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    if (!this.isEnabled()) {
      // If X-Ray is disabled, just run the operation without tracing
      const dummySubsegment = {} as SubsegmentLike;
      return operation(dummySubsegment);
    }

    const segment = this.getSegment();
    if (!segment) {
      // No segment available, run without tracing
      const dummySubsegment = {} as SubsegmentLike;
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
    operation: (subsegment: SubsegmentLike) => T,
    metadata?: Record<string, unknown>
  ): T {
    if (!this.isEnabled()) {
      // If X-Ray is disabled, just run the operation without tracing
      const dummySubsegment = {} as SubsegmentLike;
      return operation(dummySubsegment);
    }

    const segment = this.getSegment();
    if (!segment) {
      // No segment available, run without tracing
      const dummySubsegment = {} as SubsegmentLike;
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

    this.tracer.putAnnotation(key, value);
  }

  /**
   * Adds metadata to current segment
   */
  addMetadata(key: string, value: unknown): void {
    if (!this.isEnabled()) {
      return;
    }

    this.tracer.putMetadata(key, value);
  }
}

const xrayClient = new XRayClient();
export default xrayClient;
