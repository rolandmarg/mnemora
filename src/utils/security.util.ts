import { logger } from '../clients/logger.client.js';
import { getCorrelationId } from './correlation.util.js';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function requireDevelopment(): void {
  if (isProduction()) {
    const error = new SecurityError(
      'This operation is disabled in production environment. Set NODE_ENV=development to enable.'
    );
    auditLog('security_violation', {
      action: 'requireDevelopment',
      error: error.message,
      environment: process.env.NODE_ENV ?? 'development',
    });
    throw error;
  }
}

export function auditLog(action: string, details: Record<string, unknown>): void {
  const correlationId = getCorrelationId();
  const timestamp = new Date().toISOString();
  const environment = process.env.NODE_ENV ?? 'development';
  
  logger.warn('Security audit log', {
    audit: true,
    action,
    timestamp,
    environment,
    correlationId,
    ...details,
  });
}

export function auditDeletionAttempt(method: string, params: Record<string, unknown>): void {
  auditLog('deletion_attempt', {
    method,
    params,
    blocked: true,
  });
}

export function auditManualSend(script: string, details: Record<string, unknown>): void {
  auditLog('manual_send', {
    script,
    ...details,
  });
}

