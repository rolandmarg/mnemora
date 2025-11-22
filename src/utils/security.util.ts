import { getCorrelationId } from './correlation.util.js';
import { config } from '../config.js';
import type { Logger } from '../types/logger.types.js';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

export function requireDevelopment(logger: Logger): void {
  if (config.environment === 'production') {
    const error = new SecurityError(
      'This operation is disabled in production environment. Set NODE_ENV=development to enable.'
    );
    auditLog(logger, 'security_violation', {
      action: 'requireDevelopment',
      error: error.message,
      environment: config.environment,
    });
    throw error;
  }
}

function auditLog(logger: Logger, action: string, details: Record<string, unknown>): void {
  const correlationId = getCorrelationId();
  const timestamp = new Date().toISOString();
  
  logger.warn('Security audit log', {
    audit: true,
    action,
    timestamp,
    environment: config.environment,
    correlationId,
    ...details,
  });
}

export function auditDeletionAttempt(logger: Logger, method: string, params?: Record<string, unknown>): void {
  auditLog(logger, 'deletion_attempt', {
    method,
    params,
    blocked: true,
  });
}

export function auditManualSend(logger: Logger, script: string, details: Record<string, unknown>): void {
  auditLog(logger, 'manual_send', {
    script,
    ...details,
  });
}

