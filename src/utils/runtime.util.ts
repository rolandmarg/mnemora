import { randomUUID } from 'crypto';

export function isLambda(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

export function getLambdaFunctionName(): string | undefined {
  return process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export function getLambdaFunctionVersion(): string | undefined {
  return process.env.AWS_LAMBDA_FUNCTION_VERSION;
}

export function getLambdaRequestId(): string | undefined {
  return process.env.AWS_REQUEST_ID;
}

export function getXRayTraceId(): string | undefined {
  const traceId = process.env._X_AMZN_TRACE_ID;
  if (traceId) {
    const match = traceId.match(/Root=([^;]+)/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

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

