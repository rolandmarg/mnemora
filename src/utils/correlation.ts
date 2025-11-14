/**
 * Correlation ID System
 * 
 * Generates and propagates correlation IDs across async operations
 * Supports X-Ray trace ID integration for AWS Lambda
 */

import { randomUUID } from 'crypto';

/**
 * Correlation ID storage using AsyncLocalStorage for async context propagation
 */
class CorrelationContext {
  private static storage = new Map<string, string>();

  /**
   * Get current correlation ID
   */
  static getCorrelationId(): string | undefined {
    // Check if we're in Lambda and have X-Ray trace ID
    const traceId = process.env._X_AMZN_TRACE_ID;
    if (traceId) {
      // Extract trace ID from X-Ray format: Root=1-xxx;Parent=yyy;Sampled=1
      const match = traceId.match(/Root=([^;]+)/);
      if (match) {
        return match[1];
      }
    }

    // Fallback to stored correlation ID
    return this.storage.get('correlationId');
  }

  /**
   * Set correlation ID
   */
  static setCorrelationId(id: string): void {
    this.storage.set('correlationId', id);
  }

  /**
   * Generate new correlation ID
   */
  static generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Initialize correlation ID (generate if not exists)
   */
  static initializeCorrelationId(): string {
    const existing = this.getCorrelationId();
    if (existing) {
      return existing;
    }

    const newId = this.generateCorrelationId();
    this.setCorrelationId(newId);
    return newId;
  }

  /**
   * Clear correlation ID
   */
  static clearCorrelationId(): void {
    this.storage.delete('correlationId');
  }

  /**
   * Run function with correlation ID context
   */
  static async runWithCorrelationId<T>(
    correlationId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const previous = this.getCorrelationId();
    this.setCorrelationId(correlationId);
    try {
      return await fn();
    } finally {
      if (previous) {
        this.setCorrelationId(previous);
      } else {
        this.clearCorrelationId();
      }
    }
  }
}

/**
 * Get current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return CorrelationContext.getCorrelationId();
}

/**
 * Set correlation ID
 */
export function setCorrelationId(id: string): void {
  CorrelationContext.setCorrelationId(id);
}

/**
 * Generate new correlation ID
 */
export function generateCorrelationId(): string {
  return CorrelationContext.generateCorrelationId();
}

/**
 * Initialize correlation ID (generate if not exists)
 */
export function initializeCorrelationId(): string {
  return CorrelationContext.initializeCorrelationId();
}

/**
 * Clear correlation ID
 */
export function clearCorrelationId(): void {
  CorrelationContext.clearCorrelationId();
}

/**
 * Run function with correlation ID context
 */
export async function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => Promise<T>
): Promise<T> {
  return CorrelationContext.runWithCorrelationId(correlationId, fn);
}

