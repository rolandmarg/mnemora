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

import { BaseOutputChannel } from '../output-channel.base.js';
import { AlertingService } from '../../services/alerting.service.js';
import { MetricsCollector, trackWhatsAppMessageSent, trackWhatsAppAuthRequired, trackOperationDuration } from '../../services/metrics.service.js';
import { AuthReminderService } from '../../services/auth-reminder.service.js';
import { logSentMessage } from '../../services/message-logger.service.js';
import type { SendOptions, SendResult, OutputChannelMetadata } from '../output-channel.interface.js';
import type { AppContext } from '../../app-context.js';

export class WhatsAppOutputChannel extends BaseOutputChannel {
  private readonly alerting: AlertingService;
  private readonly metrics: MetricsCollector;
  private readonly authReminder: AuthReminderService;

  constructor(private readonly ctx: AppContext) {
    super();
    this.alerting = new AlertingService(ctx);
    this.metrics = new MetricsCollector(ctx);
    this.authReminder = new AuthReminderService(ctx);
  }

  private async initializeClient(): Promise<void> {
    try {
      await this.ctx.clients.whatsapp.initialize();
      
      if (this.ctx.clients.whatsapp.requiresAuth()) {
        trackWhatsAppAuthRequired(this.metrics);
        this.alerting.sendWhatsAppAuthRequiredAlert({
          qrCodeAvailable: true,
          environment: this.ctx.isLambda ? 'lambda' : 'local',
        });
      }
      
      if (this.ctx.clients.whatsapp.isClientReady()) {
        await this.authReminder.recordAuthentication().catch(() => {});
      }
    } catch (error) {
      this.ctx.logger.error('Failed to initialize WhatsApp client', error);
      this.alerting.sendWhatsAppClientInitFailedAlert(error instanceof Error ? error : new Error(String(error)), {
        reason: 'initialization_error',
      });
      throw error;
    }
  }

  async send(message: string, options?: SendOptions): Promise<SendResult> {
    const startTime = Date.now();
    try {
      await this.authReminder.checkAndEmitReminder().catch(() => {});
      
      const authStatus = await this.authReminder.getAuthStatus().catch(() => null);
      if (authStatus?.needsRefresh) {
        this.alerting.sendWhatsAppAuthRefreshNeededAlert(authStatus.daysSinceAuth, {
          lastAuthDate: authStatus.lastAuthDate?.toISOString(),
        });
      }

      await this.initializeClient();

      if (!this.ctx.clients.whatsapp.isClientReady()) {
        return {
          success: false,
          error: new Error('WhatsApp client is not ready'),
        };
      }

      let groupId = options?.recipients?.[0] ?? this.ctx.config.whatsapp.groupId;

      if (groupId && !groupId.includes('@') && (groupId.includes(' ') || !/^\d+$/.test(groupId))) {
        this.ctx.logger.info(`Searching for group by name: ${groupId}`);
        const foundGroup = await this.ctx.clients.whatsapp.findGroupByName(groupId);
        
        if (foundGroup) {
          groupId = foundGroup.id;
          this.ctx.logger.info(`Found group ID: ${foundGroup.id}`);
        } else {
          const error = new Error(`Group "${groupId}" not found`);
          this.alerting.sendWhatsAppGroupNotFoundAlert(groupId, {
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
          if (!this.ctx.clients.whatsapp.isClientReady()) {
            throw new Error('Client is not ready');
          }

          const result = await this.ctx.clients.whatsapp.sendMessage(chatId, message);

          const duration = Date.now() - startTime;
          trackWhatsAppMessageSent(this.metrics, true);
          trackOperationDuration(this.metrics, 'whatsapp.send', duration, { success: 'true', attempt: attempt.toString() });

          this.ctx.logger.info('WhatsApp message sent successfully', {
            groupId: chatId,
            messageId: result.id,
            attempt,
            duration,
          });

          await logSentMessage(
            this.ctx,
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
            this.ctx.logger.warn(`WhatsApp send attempt ${attempt} failed, retrying...`, {
              error: lastError.message,
            });
            
            if (!this.ctx.clients.whatsapp.isClientReady()) {
              this.ctx.logger.info('Client invalid after protocol error, reinitializing...');
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
      trackWhatsAppMessageSent(this.metrics, false);
      trackOperationDuration(this.metrics, 'whatsapp.send', duration, { success: 'false' });
      this.ctx.logger.error('Error sending WhatsApp message', error);
      
      this.alerting.sendWhatsAppMessageFailedAlert(error, {
        groupId: options?.recipients?.[0] ?? this.ctx.config.whatsapp.groupId,
        retries: 3,
      });

      await logSentMessage(
        this.ctx,
        undefined,
        'other',
        options?.recipients?.[0] ?? this.ctx.config.whatsapp.groupId ?? 'unknown',
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

      if (!this.ctx.clients.whatsapp.isClientReady()) {
        throw new Error('WhatsApp client is not ready');
      }

      const foundGroup = await this.ctx.clients.whatsapp.findGroupByName(groupName);
      return foundGroup?.id ?? null;
    } catch (error) {
      this.ctx.logger.error('Error finding group by name', error);
      throw error;
    }
  }

  async requiresAuth(): Promise<boolean> {
    const needsRefresh = await this.authReminder.isRefreshNeeded();
    if (needsRefresh) {
      return true;
    }

    return this.ctx.clients.whatsapp.requiresAuth();
  }

  async getAuthStatus(): Promise<{
    isReady: boolean;
    requiresAuth: boolean;
    authRequired: boolean;
    lastAuthDate: Date | null;
    daysSinceAuth: number | null;
  }> {
    const authStatus = await this.authReminder.getAuthStatus();
    const clientStatus = this.ctx.clients.whatsapp.getAuthStatus();
    
    return {
      isReady: clientStatus.isReady,
      requiresAuth: await this.requiresAuth(),
      authRequired: clientStatus.requiresAuth,
      lastAuthDate: authStatus.lastAuthDate,
      daysSinceAuth: authStatus.daysSinceAuth,
    };
  }

  isAvailable(): boolean {
    return !!this.ctx.config.whatsapp.groupId;
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
      await this.ctx.clients.whatsapp.destroy();
    } catch (error) {
      this.ctx.logger.error('Error destroying WhatsApp client', error);
    }
  }
}
