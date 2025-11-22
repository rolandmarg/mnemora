export interface ClientErrorOptions {
  clientName: string;
  message: string;
  cause?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Standardized error class for all client errors
 * 
 * Provides consistent error handling across all external API clients:
 * - Client name in error message
 * - Optional cause chain for error chaining
 * - Metadata support for debugging
 * - Proper error name formatting
 */
export class ClientError extends Error {
  public readonly clientName: string;
  public readonly cause?: Error;
  public readonly metadata?: Record<string, unknown>;

  constructor(options: ClientErrorOptions) {
    super(options.message);
    this.clientName = options.clientName;
    this.cause = options.cause;
    this.metadata = options.metadata;
    this.name = `${options.clientName}Error`;
    
    // Preserve stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ClientError);
    }
    
    // If there's a cause, append its stack trace
    if (options.cause && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

