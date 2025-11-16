import { logger } from '../clients/logger.client.js';
import { createWhatsAppSessionStorage } from '../utils/storage.util.js';
import { formatDateISO } from '../utils/date-helpers.util.js';
import { isLambdaEnvironment } from '../utils/env.util.js';
import type { MessageType, MessageRecord } from '../types/message.types.js';

class MessageLoggerService {
  private readonly storage: ReturnType<typeof createWhatsAppSessionStorage>;
  private readonly isLambda: boolean;
  private readonly enabled: boolean;

  constructor() {
    this.isLambda = isLambdaEnvironment();
    this.storage = createWhatsAppSessionStorage();
    this.enabled = true;
  }

  logMessage(record: MessageRecord): void {
    if (!this.enabled) {
      return;
    }

    logger.info('Message sent', {
      messageId: record.messageId,
      messageType: record.messageType,
      recipient: record.recipient,
      content: record.content,
      success: record.success,
      duration: record.duration,
      error: record.error,
      metadata: record.metadata,
      timestamp: record.timestamp,
    });
  }

  async persistMessage(record: MessageRecord): Promise<void> {
    if (!this.enabled || !this.isLambda) {
      this.logMessage(record);
      return;
    }

    try {
      const date = new Date(record.timestamp);
      const dateStr = formatDateISO(date);
      const timestamp = date.toISOString().replace(/[:.]/g, '-');
      
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
    }
  }

  async logAndPersist(record: MessageRecord): Promise<void> {
    this.logMessage(record);
    await this.persistMessage(record).catch(() => {});
  }
}

const messageLogger = new MessageLoggerService();

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

