import type { AppConfig } from '../config.js';
import { isLambda } from '../utils/runtime.util.js';
import { ClientError } from './errors/client-error.js';

interface SubsegmentLike {
  addMetadata(key: string, value: unknown): void;
  addError(error: Error): void;
  close(): void;
}

/**
 * Interface for X-Ray client operations
 * Used for dependency injection to avoid tight coupling
 */
export interface XRayClientInterface {
  captureAsyncSegment<T>(
    name: string,
    operation: (subsegment: SubsegmentLike) => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T>;
}

/**
 * Base class for external API clients
 * 
 * Provides lightweight utilities:
 * - Dependency injection (config, xrayClient)
 * - Lambda runtime detection
 * - X-Ray tracing wrapper
 * - Error handling utilities
 * 
 * Clients can extend this class to use the utilities, but it's optional.
 * No abstract methods are required - clients handle their own initialization and validation.
 */
export class BaseClient {
  protected readonly config: AppConfig;
  protected readonly xrayClient: XRayClientInterface;
  protected readonly isLambda: boolean;

  constructor(config: AppConfig, xrayClient: XRayClientInterface) {
    this.config = config;
    this.xrayClient = xrayClient;
    this.isLambda = isLambda();
  }

  /**
   * Wrapper for X-Ray tracing of async operations
   * Automatically prefixes operation name with client name
   * 
   * @param clientName - Name of the client (e.g., 'GoogleCalendar')
   * @param operationName - Name of the operation (e.g., 'fetchEvents')
   * @param operation - Async operation to trace
   * @param metadata - Optional metadata to add to trace
   * @returns Result of the operation
   */
  protected async captureSegment<T>(
    clientName: string,
    operationName: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const segmentName = `${clientName}.${operationName}`;
    
    return this.xrayClient.captureAsyncSegment(
      segmentName,
      async (_subsegment: SubsegmentLike) => operation(),
      metadata
    );
  }

  /**
   * Standardized error creation
   * Creates a ClientError with proper formatting and metadata
   * 
   * @param clientName - Name of the client (e.g., 'GoogleCalendar')
   * @param message - Error message
   * @param cause - Optional underlying error
   * @param metadata - Optional metadata for debugging
   * @returns ClientError instance
   */
  protected createError(
    clientName: string,
    message: string,
    cause?: Error,
    metadata?: Record<string, unknown>
  ): ClientError {
    return new ClientError({
      clientName,
      message,
      cause,
      metadata,
    });
  }
}
