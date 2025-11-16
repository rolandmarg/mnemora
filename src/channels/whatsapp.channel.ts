/**
 * WhatsApp Output Channel
 * 
 * Implementation using whatsapp-web.js to send messages to WhatsApp groups
 * 
 * Login flow:
 * 1. Displays QR code in terminal
 * 2. Prompts user to scan with WhatsApp mobile app
 * 3. Waits for authentication
 * 4. Saves session for future use
 */

// External dependencies
// (none)

// Internal modules - Base
import { BaseOutputChannel } from '../output-channel/output-channel.base.js';

// Internal modules - Clients
import whatsappClient from '../clients/whatsapp.client.js';

// Internal modules - Services
import {
  sendWhatsAppAuthRequiredAlert,
  sendWhatsAppClientInitFailedAlert,
  sendWhatsAppGroupNotFoundAlert,
  sendWhatsAppMessageFailedAlert,
  sendWhatsAppAuthRefreshNeededAlert,
} from '../services/alerting.service.js';

// Internal modules - Clients
import { logger } from '../clients/logger.client.js';

// Internal modules - Services
import { trackWhatsAppMessageSent, trackWhatsAppAuthRequired, trackOperationDuration } from '../services/metrics.service.js';
import { authReminder } from '../services/auth-reminder.service.js';
import { logSentMessage } from '../services/message-logger.service.js';
import { isLambdaEnvironment } from '../utils/env.util.js';

// Internal modules - Types
import type { SendOptions, SendResult, OutputChannelMetadata } from '../output-channel/output-channel.interface.js';
import type { AppConfig } from '../config.js';

/**
 * WhatsApp output channel implementation using whatsapp-web.js
 * 
 * Sends WhatsApp messages via WhatsApp Web API
 * Runs completely headless - QR code shown in terminal only
 */
export class WhatsAppOutputChannel extends BaseOutputChannel {
  private readonly config: AppConfig;
  private readonly isLambda: boolean;

  constructor(config: AppConfig) {
    super();
    this.config = config;
    this.isLambda = isLambdaEnvironment();
  }

  private async initializeClient(): Promise<void> {
    try {
      await whatsappClient.initialize();
      
      if (whatsappClient.requiresAuth()) {
        trackWhatsAppAuthRequired();
        sendWhatsAppAuthRequiredAlert({
          qrCodeAvailable: true,
          environment: this.isLambda ? 'lambda' : 'local',
        });
      }
      
      if (whatsappClient.isClientReady()) {
        await authReminder.recordAuthentication().catch(() => {});
      }
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client', error);
      sendWhatsAppClientInitFailedAlert(error instanceof Error ? error : new Error(String(error)), {
        reason: 'initialization_error',
      });
      throw error;
    }
  }

  async send(message: string, options?: SendOptions): Promise<SendResult> {
    const startTime = Date.now();
    try {
      await authReminder.checkAndEmitReminder().catch(() => {});
      
      const authStatus = await authReminder.getAuthStatus().catch(() => null);
      if (authStatus?.needsRefresh) {
        sendWhatsAppAuthRefreshNeededAlert(authStatus.daysSinceAuth, {
          lastAuthDate: authStatus.lastAuthDate?.toISOString(),
        });
      }

      await this.initializeClient();

      if (!whatsappClient.isClientReady()) {
        return {
          success: false,
          error: new Error('WhatsApp client is not ready'),
        };
      }

      let groupId = options?.recipients?.[0] ?? this.config.whatsapp.groupId;

      if (groupId && !groupId.includes('@') && (groupId.includes(' ') || !/^\d+$/.test(groupId))) {
        logger.info(`Searching for group by name: ${groupId}`);
        const foundGroup = await whatsappClient.findGroupByName(groupId);
        
        if (foundGroup) {
          groupId = foundGroup.id;
          logger.info(`Found group ID: ${foundGroup.id}`);
        } else {
          const error = new Error(`Group "${groupId}" not found`);
          sendWhatsAppGroupNotFoundAlert(groupId, {
            searchedName: groupId,
          });
          return {
            success: false,
            error,
          };
        }
      }

      if (!groupId) {
        return {
          success: false,
          error: new Error('No WhatsApp group ID specified. Set WHATSAPP_GROUP_ID in .env or provide recipients in options'),
        };
      }

      const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
      
      let lastError: Error | null = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (!whatsappClient.isClientReady()) {
            throw new Error('Client is not ready');
          }

          const result = await whatsappClient.sendMessage(chatId, message);

          const duration = Date.now() - startTime;
          trackWhatsAppMessageSent(true);
          trackOperationDuration('whatsapp.send', duration, { success: 'true', attempt: attempt.toString() });

          logger.info('WhatsApp message sent successfully', {
            groupId: chatId,
            messageId: result.id,
            attempt,
            duration,
          });

          await logSentMessage(
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
            logger.warn(`WhatsApp send attempt ${attempt} failed, retrying...`, {
              error: lastError.message,
            });
            
            if (!whatsappClient.isClientReady()) {
              logger.info('Client invalid after protocol error, reinitializing...');
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
      const duration = Date.now() - startTime;
      trackWhatsAppMessageSent(false);
      trackOperationDuration('whatsapp.send', duration, { success: 'false' });
      logger.error('Error sending WhatsApp message', error);
      
      sendWhatsAppMessageFailedAlert(error, {
        groupId: options?.recipients?.[0] ?? this.config.whatsapp.groupId,
        retries: 3,
      });

      await logSentMessage(
        undefined,
        'other',
        options?.recipients?.[0] ?? this.config.whatsapp.groupId ?? 'unknown',
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

      if (!whatsappClient.isClientReady()) {
        throw new Error('WhatsApp client is not ready');
      }

      const foundGroup = await whatsappClient.findGroupByName(groupName);
      return foundGroup?.id ?? null;
    } catch (error) {
      logger.error('Error finding group by name', error);
      throw error;
    }
  }

  async requiresAuth(): Promise<boolean> {
    const needsRefresh = await authReminder.isRefreshNeeded();
    if (needsRefresh) {
      return true;
    }

    return whatsappClient.requiresAuth();
  }

  async getAuthStatus(): Promise<{
    isReady: boolean;
    requiresAuth: boolean;
    authRequired: boolean;
    lastAuthDate: Date | null;
    daysSinceAuth: number | null;
  }> {
    const authStatus = await authReminder.getAuthStatus();
    const clientStatus = whatsappClient.getAuthStatus();
    
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
      name: 'WhatsApp (Web.js)',
      type: 'whatsapp',
      description: 'Sends WhatsApp messages via whatsapp-web.js',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: false,
      capabilities: ['whatsapp', 'group-messaging', 'qr-authentication'],
    };
  }

  async destroy(): Promise<void> {
    try {
      await whatsappClient.destroy();
    } catch (error) {
      logger.error('Error destroying WhatsApp client', error);
    }
  }
}
