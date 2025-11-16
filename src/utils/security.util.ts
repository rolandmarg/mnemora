import { getCorrelationId } from './correlation.util.js';
import type { AppContext } from '../app-context.js';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

export function requireDevelopment(ctx: AppContext): void {
  if (ctx.isProduction) {
    const error = new SecurityError(
      'This operation is disabled in production environment. Set NODE_ENV=development to enable.'
    );
    auditLog(ctx, 'security_violation', {
      action: 'requireDevelopment',
      error: error.message,
      environment: ctx.environment,
    });
    throw error;
  }
}

export function auditLog(ctx: AppContext, action: string, details: Record<string, unknown>): void {
  const correlationId = getCorrelationId();
  const timestamp = new Date().toISOString();
  
  ctx.logger.warn('Security audit log', {
    audit: true,
    action,
    timestamp,
    environment: ctx.environment,
    correlationId,
    ...details,
  });
}

export function auditDeletionAttempt(ctxOrMethod: AppContext | string, methodOrParams?: string | Record<string, unknown>, params?: Record<string, unknown>): void {
  // Support both old signature (ctx, method, params) and new signature (method, params) for clients
  if (typeof ctxOrMethod === 'string') {
    const method = ctxOrMethod;
    const methodParams = methodOrParams as Record<string, unknown> | undefined;
    console.warn('Security audit log - deletion attempt', {
      audit: true,
      action: 'deletion_attempt',
      method,
      params: methodParams,
      blocked: true,
      timestamp: new Date().toISOString(),
    });
  } else {
    const ctx = ctxOrMethod;
    const method = methodOrParams as string;
    const methodParams = params;
    auditLog(ctx, 'deletion_attempt', {
      method,
      params: methodParams,
      blocked: true,
    });
  }
}

export function auditManualSend(ctx: AppContext, script: string, details: Record<string, unknown>): void {
  auditLog(ctx, 'manual_send', {
    script,
    ...details,
  });
}

