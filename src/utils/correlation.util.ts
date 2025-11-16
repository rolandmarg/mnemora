import { randomUUID } from 'crypto';
import { getXRayTraceId } from './runtime.util.js';

class CorrelationContext {
  private static storage = new Map<string, string>();

  static getCorrelationId(): string | undefined {
    const traceId = getXRayTraceId();
    if (traceId) {
      return traceId;
    }

    return this.storage.get('correlationId');
  }

  static setCorrelationId(id: string): void {
    this.storage.set('correlationId', id);
  }

  static generateCorrelationId(): string {
    return randomUUID();
  }

  static initializeCorrelationId(): string {
    const existing = this.getCorrelationId();
    if (existing) {
      return existing;
    }

    const newId = this.generateCorrelationId();
    this.setCorrelationId(newId);
    return newId;
  }

  static clearCorrelationId(): void {
    this.storage.delete('correlationId');
  }

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

export function getCorrelationId(): string | undefined {
  return CorrelationContext.getCorrelationId();
}

export function setCorrelationId(id: string): void {
  CorrelationContext.setCorrelationId(id);
}

export function initializeCorrelationId(): string {
  return CorrelationContext.initializeCorrelationId();
}

