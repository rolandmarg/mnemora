/**
 * Message Logger
 * 
 * Persists all sent messages to S3 for audit trail and debugging
 * Logs full message content to CloudWatch Logs
 * 
 * TODO: This is a foundation for enhanced logging. Full implementation planned.
 * See TODO.md for details on message persistence improvements.
 */

import { logger } from './logger.js';
import { createWhatsAppSessionStorage } from './s3-storage.js';
import { formatDateISO } from './date-helpers.js';

/**
 * Message types
 */
export type MessageType = 'birthday' | 'monthly-digest' | 'test' | 'other';

/**
 * Message record for persistence
 */
export interface MessageRecord {
  messageId?: string;
  timestamp: string;
  messageType: MessageType;
  recipient: string;
  content: string;
  success: boolean;
  duration?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Check if running in Lambda environment
 */
function isLambdaEnvironment(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

/**
 * Message logger service
 */
class MessageLoggerService {
  private readonly storage: ReturnType<typeof createWhatsAppSessionStorage>;
  private readonly isLambda: boolean;
  private readonly enabled: boolean;

  constructor() {
    this.isLambda = isLambdaEnvironment();
    this.storage = createWhatsAppSessionStorage();
    // Enable message logging (can be controlled via env var in future)
    this.enabled = true;
  }

  /**
   * Log message to CloudWatch Logs (full content)
   */
  logMessage(record: MessageRecord): void {
    if (!this.enabled) {
      return;
    }

    // Log full message content to CloudWatch Logs
    logger.info('Message sent', {
      messageId: record.messageId,
      messageType: record.messageType,
      recipient: record.recipient,
      content: record.content, // Full message content
      success: record.success,
      duration: record.duration,
      error: record.error,
      metadata: record.metadata,
      timestamp: record.timestamp,
    });
  }

  /**
   * Persist message to S3 for audit trail
   * 
   * Storage structure:
   * messages/YYYY-MM-DD/message-{timestamp}.json
   */
  async persistMessage(record: MessageRecord): Promise<void> {
    if (!this.enabled || !this.isLambda) {
      // In local development, just log (S3 not needed)
      this.logMessage(record);
      return;
    }

    try {
      const date = new Date(record.timestamp);
      const dateStr = formatDateISO(date);
      const timestamp = date.toISOString().replace(/[:.]/g, '-');
      
      // Store in S3: messages/YYYY-MM-DD/message-{timestamp}.json
      const key = `messages/${dateStr}/message-${timestamp}.json`;
      const recordJson = JSON.stringify(record, null, 2);
      
      await this.storage.writeFile(key, recordJson);
      
      logger.debug('Message persisted to S3', {
        key,
        messageType: record.messageType,
        messageId: record.messageId,
      });
    } catch (error) {
      logger.error('Error persisting message to S3', error, {
        messageType: record.messageType,
        messageId: record.messageId,
      });
      // Don't throw - message logging is non-critical
    }
  }

  /**
   * Log and persist message (convenience method)
   */
  async logAndPersist(record: MessageRecord): Promise<void> {
    // Always log to CloudWatch Logs
    this.logMessage(record);
    
    // Persist to S3 (async, non-blocking)
    await this.persistMessage(record).catch(() => {
      // Ignore errors - logging is non-critical
    });
  }

  /**
   * Get message history for a date range
   * 
   * TODO: Implement query functionality
   * This would allow retrieving past messages for analysis
   */
  async getMessageHistory(
    _startDate: Date,
    _endDate: Date
  ): Promise<MessageRecord[]> {
    // TODO: Implement message history retrieval from S3
    logger.warn('Message history retrieval not yet implemented');
    return [];
  }

  /**
   * Get messages for a specific date
   * 
   * TODO: Implement date-based query
   */
  async getMessagesForDate(_date: Date): Promise<MessageRecord[]> {
    // TODO: Implement date-based message retrieval
    logger.warn('Date-based message retrieval not yet implemented');
    return [];
  }
}

/**
 * Global message logger instance
 */
export const messageLogger = new MessageLoggerService();

/**
 * Convenience function to log a sent message
 */
export async function logSentMessage(
  messageId: string | undefined,
  messageType: MessageType,
  recipient: string,
  content: string,
  success: boolean,
  duration?: number,
  error?: Error | unknown,
  metadata?: Record<string, unknown>
): Promise<void> {
  const record: MessageRecord = {
    messageId,
    timestamp: new Date().toISOString(),
    messageType,
    recipient,
    content,
    success,
    duration,
    error: error instanceof Error ? error.message : error ? String(error) : undefined,
    metadata,
  };

  await messageLogger.logAndPersist(record);
}

