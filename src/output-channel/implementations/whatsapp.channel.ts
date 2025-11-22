/**
 * WhatsApp Output Channel
 * 
 * Implementation using Baileys to send messages to WhatsApp groups
 * 
 * Login flow:
 * 1. Displays QR code in terminal
 * 2. Prompts user to scan with WhatsApp mobile app
 * 3. Waits for authentication
 * 4. Saves session for future use
 */

import { BaseOutputChannel } from '../output-channel.base.js';
import type { AlertingService } from '../../services/alerting.service.js';
import { MetricsCollector, trackWhatsAppMessageSent, trackWhatsAppAuthRequired, trackOperationDuration } from '../../services/metrics.service.js';
import { AuthReminderService } from '../../services/auth-reminder.service.js';
import { WhatsAppSessionManagerService } from '../../services/whatsapp-session-manager.service.js';
import { logSentMessage } from '../../services/message-logger.service.js';
import { QRAuthenticationRequiredError } from '../../types/qr-auth-error.js';
import { isLambda } from '../../utils/runtime.util.js';
import type { SendOptions, SendResult, OutputChannelMetadata } from '../output-channel.interface.js';
import type { Logger } from '../../types/logger.types.js';
import type { AppConfig } from '../../config.js';
import type { WhatsAppOutputChannelOptions, WhatsAppClient } from '../output-channel.factory.js';

export class WhatsAppOutputChannel extends BaseOutputChannel {
  private readonly logger: Logger;
  private readonly config: AppConfig;
  private readonly whatsappClient: WhatsAppClient;
  private readonly alerting: AlertingService;
  private readonly metrics: MetricsCollector;
  private readonly authReminder: AuthReminderService;
  private readonly sessionManager: WhatsAppSessionManagerService;

  constructor(options: WhatsAppOutputChannelOptions) {
    super();
    const { logger, config, whatsappClient, alerting, cloudWatchClient } = options;
    this.logger = logger;
    this.config = config;
    this.whatsappClient = whatsappClient;
    this.alerting = alerting;
    this.metrics = new MetricsCollector({
      logger,
      config,
      cloudWatchClient,
      alerting,
    });
    this.authReminder = new AuthReminderService({
      logger,
      config,
      cloudWatchClient,
    });
    this.sessionManager = new WhatsAppSessionManagerService(logger);
  }

  /**
   * Get the WhatsApp session path. Helper to avoid repetition.
   */
  private getSessionPath(): string {
    return this.whatsappClient.getSessionPath();
  }

  /**
   * Sync session to S3 if in Lambda. Helper to avoid repetition.
   * Made public so orchestrator can sync at the end.
   */
  async syncSessionToS3(): Promise<void> {
    const sessionPath = this.getSessionPath();
    await this.sessionManager.syncSessionToS3(sessionPath).catch(() => {});
  }

  private async initializeClient(): Promise<void> {
    try {
      // Check if client is already initialized and ready
      if (this.whatsappClient.isClientReady()) {
        return;
      }

      // Sync session from S3 before initialization (Lambda only)
      // Only sync once at startup - if client is already ready, skip sync
      const sessionPath = this.getSessionPath();
      await this.sessionManager.syncSessionFromS3(sessionPath);
      
      await this.whatsappClient.initialize();
      
      if (this.whatsappClient.requiresAuth()) {
        trackWhatsAppAuthRequired(this.metrics);
        this.alerting.sendWhatsAppAuthRequiredAlert({
          qrCodeAvailable: true,
          environment: isLambda() ? 'lambda' : 'local',
        });
      }
      
      if (this.whatsappClient.isClientReady()) {
        this.authReminder.recordAuthentication();
      }
    } catch (error) {
      // Re-throw QR authentication required error so it bubbles up to handler
      // Don't treat it as a generic initialization failure
      if (error instanceof QRAuthenticationRequiredError) {
        throw error;
      }
      
      this.logger.error('Failed to initialize WhatsApp client', error);
      this.alerting.sendWhatsAppClientInitFailedAlert(error instanceof Error ? error : new Error(String(error)), {
        reason: 'initialization_error',
      });
      throw error;
    }
  }

  async send(message: string, options?: SendOptions): Promise<SendResult> {
    const startTime = Date.now();
    let resolvedGroupId: string | undefined;

    try {
      await this.authReminder.checkAndEmitReminder().catch(() => {});
      
      const authStatus = await this.authReminder.getAuthStatus().catch(() => null);
      if (authStatus?.needsRefresh) {
        this.alerting.sendWhatsAppAuthRefreshNeededAlert(authStatus.daysSinceAuth, {
          lastAuthDate: authStatus.lastAuthDate?.toISOString(),
        });
      }

      // Resolve group identifier from recipients or config (this also initializes the client)
      const identifier = options?.recipients?.[0];
      resolvedGroupId = await this.resolveGroupId(identifier);

      if (!this.whatsappClient.isClientReady()) {
        return {
          success: false,
          error: new Error('WhatsApp client is not ready'),
        };
      }

      if (!resolvedGroupId) {
        return {
          success: false,
          error: new Error('No WhatsApp group ID specified. Set WHATSAPP_GROUP_ID in .env or provide recipients in options'),
        };
      }

      const chatId = resolvedGroupId.includes('@g.us') ? resolvedGroupId : `${resolvedGroupId}@g.us`;
      
      let lastError: Error | null = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (!this.whatsappClient.isClientReady()) {
            throw new Error('Client is not ready');
          }

          const result = await this.whatsappClient.sendMessage(chatId, message);

          const duration = Date.now() - startTime;
          trackWhatsAppMessageSent(this.metrics, true);
          trackOperationDuration(this.metrics, 'whatsapp.send', duration, { success: 'true', attempt: attempt.toString() });

          this.logger.info('WhatsApp message sent successfully', {
            groupId: chatId,
            messageId: result.id,
            attempt,
            duration,
          });

          await logSentMessage(
            this.logger,
            result.id,
            'other',
            chatId,
            message,
            true,
            duration,
            undefined,
            {
              attempt,
              from: result.from,
            }
          ).catch(() => {});

          // Note: Session sync removed here - will sync after all messages in orchestrator
          // This reduces sync frequency from N times (one per message) to once after all messages

          return {
            success: true,
            messageId: result.id,
            recipient: chatId,
            metadata: {
              timestamp: new Date().toISOString(),
              from: result.from,
            },
          };
        } catch (sendError) {
          lastError = sendError instanceof Error ? sendError : new Error(String(sendError));
          
          const isProtocolError = lastError.message.includes('Protocol error') || 
                                  lastError.message.includes('Execution context') ||
                                  lastError.message.includes('Target closed');
          
          if (isProtocolError && attempt < maxRetries) {
            this.logger.warn(`WhatsApp send attempt ${attempt} failed, retrying...`, {
              error: lastError.message,
            });
            
            if (!this.whatsappClient.isClientReady()) {
              this.logger.info('Client invalid after protocol error, reinitializing...');
              await this.initializeClient();
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
          
          throw lastError;
        }
      }
      
      throw lastError ?? new Error('Failed to send message after retries');
    } catch (error) {
      // Re-throw QR authentication required error so it bubbles up to handler
      // This is a fatal error that should stop execution, not be treated as a failed send
      if (error instanceof QRAuthenticationRequiredError) {
        throw error;
      }
      
      const duration = Date.now() - startTime;
      trackWhatsAppMessageSent(this.metrics, false);
      trackOperationDuration(this.metrics, 'whatsapp.send', duration, { success: 'false' });
      this.logger.error('Error sending WhatsApp message', {
        error,
        groupId: resolvedGroupId,
      });
      
      this.alerting.sendWhatsAppMessageFailedAlert(error, {
        groupId: resolvedGroupId ?? options?.recipients?.[0] ?? this.config.whatsapp.groupId,
        retries: 3,
      });

      await logSentMessage(
        this.logger,
        undefined,
        'other',
        resolvedGroupId ?? options?.recipients?.[0] ?? this.config.whatsapp.groupId ?? 'unknown',
        message,
        false,
        duration,
        error,
        {
          retries: 3,
        }
      ).catch(() => {});
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async findGroupByName(groupName: string): Promise<string | null> {
    try {
      await this.initializeClient();

      if (!this.whatsappClient.isClientReady()) {
        throw new Error('WhatsApp client is not ready');
      }

      const foundGroup = await this.whatsappClient.findGroupByName(groupName);
      return foundGroup?.id ?? null;
    } catch (error) {
      this.logger.error('Error finding group by name', error);
      throw error;
    }
  }

  /**
   * Resolves a group identifier (name or ID) to a groupId.
   * Falls back to config.whatsapp.groupId if identifier is undefined.
   * 
   * @param identifier - Group name, group ID, or undefined
   * @returns Resolved groupId string (normalized with @g.us suffix if needed)
   * @throws Error if group not found or client not ready
   */
  async resolveGroupId(identifier: string | undefined): Promise<string> {
    await this.initializeClient();

    if (!this.whatsappClient.isClientReady()) {
      throw new Error('WhatsApp client is not ready');
    }

    // Fall back to config if identifier is undefined
    const inputIdentifier = identifier ?? this.config.whatsapp.groupId;

    if (!inputIdentifier) {
      throw new Error('No WhatsApp group ID specified. Set WHATSAPP_GROUP_ID in .env or provide identifier');
    }

    // If it looks like a group ID (contains @g.us or is just digits), normalize and return it
    if (inputIdentifier.includes('@g.us') || /^\d+$/.test(inputIdentifier)) {
      return inputIdentifier.includes('@g.us') ? inputIdentifier : `${inputIdentifier}@g.us`;
    }

    // Otherwise, treat it as a group name and search for it
    this.logger.info(`Searching for group by name: ${inputIdentifier}`);
    const foundGroup = await this.whatsappClient.findGroupByName(inputIdentifier);

    if (!foundGroup) {
      const error = new Error(`Group "${inputIdentifier}" not found`);
      this.alerting.sendWhatsAppGroupNotFoundAlert(inputIdentifier, {
        searchedName: inputIdentifier,
      });
      throw error;
    }

    this.logger.info(`Found group ID: ${foundGroup.id}`);
    return foundGroup.id;
  }

  async requiresAuth(): Promise<boolean> {
    const needsRefresh = await this.authReminder.isRefreshNeeded();
    if (needsRefresh) {
      return true;
    }

    return this.whatsappClient.requiresAuth();
  }

  async getAuthStatus(): Promise<{
    isReady: boolean;
    requiresAuth: boolean;
    authRequired: boolean;
    lastAuthDate: Date | null;
    daysSinceAuth: number | null;
  }> {
    const authStatus = await this.authReminder.getAuthStatus();
    const clientStatus = this.whatsappClient.getAuthStatus();
    
    return {
      isReady: clientStatus.isReady,
      requiresAuth: await this.requiresAuth(),
      authRequired: clientStatus.requiresAuth,
      lastAuthDate: authStatus.lastAuthDate,
      daysSinceAuth: authStatus.daysSinceAuth,
    };
  }

  isAvailable(): boolean {
    return !!this.config.whatsapp.groupId;
  }

  getMetadata(): OutputChannelMetadata {
    return {
      name: 'WhatsApp (Baileys)',
      type: 'whatsapp',
      description: 'Sends WhatsApp messages via Baileys',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: false,
      capabilities: ['whatsapp', 'group-messaging', 'qr-authentication'],
    };
  }

  async flushPendingWrites(): Promise<void> {
    await this.authReminder.flushPendingWrites();
  }

  async destroy(): Promise<void> {
    try {
      // Flush pending S3 writes (auth reminder) before session sync
      await this.flushPendingWrites();
      
      // Sync session to S3 before destroying (Lambda only)
      // This is the only place we save session to S3 after loading at start
      await this.syncSessionToS3();
      
      await this.whatsappClient.destroy();
    } catch (error) {
      this.logger.error('Error destroying WhatsApp client', error);
    }
  }
}
