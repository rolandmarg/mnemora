import { StorageService } from './storage.service.js';
import { formatDateISO } from '../utils/date-helpers.util.js';
import { isLambda } from '../utils/runtime.util.js';
import type { Logger } from '../types/logger.types.js';
import type { MessageType, MessageRecord } from '../types/message.types.js';

class MessageLoggerService {
  private readonly storage = StorageService.getAppStorage();
  private readonly enabled: boolean;

  constructor(private readonly logger: Logger) {
    this.enabled = true;
  }

  logMessage(record: MessageRecord): void {
    if (!this.enabled) {
      return;
    }

    this.logger.info('Message sent', {
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
    if (!this.enabled || !isLambda()) {
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
      
      this.logger.debug('Message persisted to S3', {
        key,
        messageType: record.messageType,
        messageId: record.messageId,
      });
    } catch (error) {
      this.logger.error('Error persisting message to S3', error, {
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

export async function logSentMessage(
  logger: Logger,
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

  const messageLogger = new MessageLoggerService(logger);
  await messageLogger.logAndPersist(record);
}

