import type { AppConfig } from '../config.js';
import { isLambda } from '../utils/runtime.util.js';
import { ClientError } from './errors/client-error.js';

/**
 * Base class for external API clients
 *
 * Provides lightweight utilities:
 * - Dependency injection (config)
 * - Lambda runtime detection
 * - Error handling utilities
 *
 * Clients can extend this class to use the utilities, but it's optional.
 * No abstract methods are required - clients handle their own initialization and validation.
 */
export class BaseClient {
  protected readonly config: AppConfig;
  protected readonly isLambda: boolean;

  constructor(config: AppConfig) {
    this.config = config;
    this.isLambda = isLambda();
  }

  /**
   * Standardized error creation
   * Creates a ClientError with proper formatting and metadata
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
