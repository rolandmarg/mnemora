/**
 * Security Utilities
 * 
 * Provides security checks, environment validation, and audit logging
 * for security-sensitive operations.
 */

// Internal modules
import { logger } from './logger.js';
import { getCorrelationId } from './correlation.js';

/**
 * Security Error
 * 
 * Thrown when a security restriction is violated
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

/**
 * Check if running in production environment
 * 
 * @returns true if NODE_ENV === 'production'
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Require development environment
 * 
 * Throws SecurityError if running in production
 * 
 * @throws SecurityError if in production
 */
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

/**
 * Audit log for security-sensitive operations
 * 
 * Logs all security events with structured data for monitoring and compliance
 * 
 * @param action - Type of security action (e.g., 'deletion_attempt', 'manual_send', 'security_violation')
 * @param details - Additional details about the action
 */
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

/**
 * Audit log for deletion attempts
 * 
 * Specialized audit logging for deletion operations
 * 
 * @param method - Method name that attempted deletion
 * @param params - Parameters passed to the deletion method
 */
export function auditDeletionAttempt(method: string, params: Record<string, unknown>): void {
  auditLog('deletion_attempt', {
    method,
    params,
    blocked: true,
  });
}

/**
 * Audit log for manual send operations
 * 
 * Specialized audit logging for manual message sending
 * 
 * @param script - Script name that attempted manual send
 * @param details - Details about the send operation
 */
export function auditManualSend(script: string, details: Record<string, unknown>): void {
  auditLog('manual_send', {
    script,
    ...details,
  });
}

