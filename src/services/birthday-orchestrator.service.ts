/**
 * Birthday Orchestrator Service
 * 
 * Orchestrates the daily birthday check process, including:
 * - Sending monthly digest on the first of the month
 * - Sending today's birthday messages
 * - Managing execution lifecycle (metrics, monitoring, cleanup)
 * 
 * This service is reusable by both local execution and Lambda handler.
 */

import { BirthdayService } from './birthday.service.js';
import { OutputChannelFactory, type WhatsAppClient } from '../output-channel/output-channel.factory.js';
import { logSentMessage } from './message-logger.service.js';
import {
  MetricsCollector,
  trackExecutionStart,
  trackExecutionComplete,
  trackMonthlyDigestSent,
  trackBirthdaySent,
} from './metrics.service.js';
import { AlertingService } from './alerting.service.js';
import { LastRunTrackerService } from './last-run-tracker.service.js';
import { getFullName } from '../utils/name-helpers.util.js';
import { isFirstDayOfMonth } from '../utils/date-helpers.util.js';
import { initializeCorrelationId } from '../utils/runtime.util.js';
import { QRAuthenticationRequiredError } from '../types/qr-auth-error.js';
import type { Logger } from '../types/logger.types.js';
import type { AppConfig } from '../config.js';
import GoogleCalendarClient from '../clients/google-calendar.client.js';
import xrayClientDefault from '../clients/xray.client.js';
import cloudWatchMetricsClientDefault from '../clients/cloudwatch.client.js';

type CalendarClient = GoogleCalendarClient;
type XRayClient = typeof xrayClientDefault;
type CloudWatchClient = typeof cloudWatchMetricsClientDefault;

interface BirthdayOrchestratorServiceOptions {
  logger: Logger;
  config: AppConfig;
  calendarClient: CalendarClient;
  xrayClient: XRayClient;
  cloudWatchClient: CloudWatchClient;
  whatsappClient: WhatsAppClient;
  alerting: AlertingService;
}

class BirthdayOrchestratorService {
  private readonly birthdayService: BirthdayService;
  private readonly metrics: MetricsCollector;
  private readonly lastRunTracker: LastRunTrackerService;

  constructor(options: BirthdayOrchestratorServiceOptions) {
    const { logger, config, xrayClient, cloudWatchClient, whatsappClient, alerting, calendarClient } = options;
    this.logger = logger;
    this.config = config;
    this.xrayClient = xrayClient;
    this.cloudWatchClient = cloudWatchClient;
    this.whatsappClient = whatsappClient;
    this.alerting = alerting;
    this.birthdayService = new BirthdayService({
      logger,
      config,
      calendarClient,
      xrayClient,
      alerting,
    });
    this.metrics = new MetricsCollector({
      logger,
      config,
      cloudWatchClient,
      alerting,
    });
    this.lastRunTracker = new LastRunTrackerService(logger);
  }

  private readonly logger: Logger;
  private readonly config: AppConfig;
  private readonly xrayClient: XRayClient;
  private readonly cloudWatchClient: CloudWatchClient;
  private readonly whatsappClient: WhatsAppClient;
  private readonly alerting: AlertingService;

  private getGroupId(channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null): string {
    if (!channel?.isAvailable()) {
      return 'unknown';
    }
    // Access config through the channel's isAvailable check or use a type assertion
    // Since WhatsAppOutputChannel stores config internally, we'll use a workaround
    return this.config.whatsapp.groupId ?? 'unknown';
  }

  private async logMessage(
    messageId: string | undefined,
    messageType: 'birthday' | 'monthly-digest' | 'other',
    channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null,
    content: string,
    success: boolean,
    duration?: number,
    error?: Error | unknown,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const groupId = this.getGroupId(channel);
    await logSentMessage(this.logger, messageId, messageType, groupId, content, success, duration, error, metadata).catch(() => {});
  }

  private async flushPendingWrites(
    channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null
  ): Promise<void> {
    try {
      // Flush last run date
      await this.lastRunTracker.flushPendingWrites();
      
      // Flush auth reminder if channel is available
      if (channel && 'flushPendingWrites' in channel && typeof channel.flushPendingWrites === 'function') {
        await channel.flushPendingWrites();
      }
    } catch (error) {
      this.logger.error('Error flushing pending writes', error);
    }
  }

  private async cleanupWhatsAppClient(
    channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null
  ): Promise<void> {
    if (!channel || !('destroy' in channel) || typeof channel.destroy !== 'function') {
      return;
    }

    try {
      // channel.destroy() handles S3 sync and cleanup with its own wait logic
      await channel.destroy();
    } catch (error) {
      this.logger.error('Error destroying WhatsApp client', error);
    }
  }


  async runBirthdayCheck(): Promise<void> {
    return this.xrayClient.captureAsyncSegment('Orchestrator.runBirthdayCheck', async () => {
      const executionStartTime = Date.now();
      
      initializeCorrelationId();
      trackExecutionStart(this.metrics);

      let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

      try {
        // Sync from Sheets to Calendar (optional - continues even if sync fails)
        try {
          await this.birthdayService.trySyncFromSheets();
        } catch (error) {
          this.logger.warn('Unexpected error during Sheets sync', error);
        }

        this.logger.info('Running birthday check...');
        
        const { todaysBirthdays, monthlyBirthdays } = await this.birthdayService.getTodaysBirthdaysWithOptionalDigest();
      
      // Send monthly digest if it's the first day of the month
      if (monthlyBirthdays) {
        const monthlyDigest = this.birthdayService.formatMonthlyDigest(monthlyBirthdays);
        this.logger.info('First day of month detected - generating monthly digest');
        this.logger.info('Monthly digest', { monthlyDigest });
        
        try {
          whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel({
          logger: this.logger,
          config: this.config,
          whatsappClient: this.whatsappClient,
          cloudWatchClient: this.cloudWatchClient,
          alerting: this.alerting,
        });
          if (whatsappChannel.isAvailable()) {
            this.logger.info('Sending monthly digest to WhatsApp group...');
            const result = await whatsappChannel.send(monthlyDigest);
            
            if (result.success) {
              trackMonthlyDigestSent(this.metrics);
              this.logger.info('Monthly digest sent to WhatsApp successfully', {
                messageId: result.messageId,
              });
              
              await this.logMessage(result.messageId, 'monthly-digest', whatsappChannel, monthlyDigest, true);
              
              await this.alerting.resolveAlert('monthly-digest-failed');
            } else {
              // Re-throw QR authentication required error - this is fatal
              if (result.error instanceof QRAuthenticationRequiredError) {
                throw result.error;
              }
              
              // Throw error - WhatsApp send failures are fatal
              const error = result.error instanceof Error 
                ? new Error(`Failed to send monthly digest to WhatsApp: ${result.error.message}`)
                : new Error('Failed to send monthly digest to WhatsApp');
              
              this.logger.error('Failed to send monthly digest to WhatsApp', {
                error: error.message,
              });
              
              if (isFirstDayOfMonth(new Date())) {
                this.alerting.sendMonthlyDigestFailedAlert(result.error ?? error, {
                  messageId: result.messageId,
                  isFirstOfMonth: true,
                });
              } else {
                this.alerting.sendWhatsAppMessageFailedAlert(result.error ?? error, {
                  messageType: 'monthly-digest',
                });
              }
              
              throw error;
            }
          } else {
            // WhatsApp channel unavailable - this is fatal when monthly digest is needed
            const error = new Error('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
            this.logger.error('WhatsApp channel is not available', {
              reason: 'channel_unavailable',
            });
            
            if (isFirstDayOfMonth(new Date())) {
              this.alerting.sendMonthlyDigestFailedAlert(error, {
                isFirstOfMonth: true,
                reason: 'channel_unavailable',
              });
            }
            
            throw error;
          }
        } catch (error) {
          // Re-throw QR authentication required error - this is fatal
          if (error instanceof QRAuthenticationRequiredError) {
            throw error;
          }
          
          // Re-throw all errors - WhatsApp failures are fatal
          this.logger.error('Error sending monthly digest to WhatsApp', error);
          
          if (isFirstDayOfMonth(new Date())) {
            this.alerting.sendMonthlyDigestFailedAlert(error, {
              isFirstOfMonth: true,
            });
          } else {
            this.alerting.sendWhatsAppMessageFailedAlert(error, {
              messageType: 'monthly-digest',
            });
          }
          
          throw error;
        }
      }
      
      if (todaysBirthdays.length === 0) {
        this.logger.info('No birthdays today!');
      } else {
        this.logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
          birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
        });
        
        try {
          whatsappChannel ??= OutputChannelFactory.createWhatsAppOutputChannel({
            logger: this.logger,
            config: this.config,
            whatsappClient: this.whatsappClient,
            cloudWatchClient: this.cloudWatchClient,
            alerting: this.alerting,
          });
          
          if (whatsappChannel.isAvailable()) {
            const birthdayMessages = this.birthdayService.formatTodaysBirthdayMessages(todaysBirthdays);
            this.logger.info('Sending birthday messages to WhatsApp group...');
            
            await birthdayMessages.reduce(async (promise, message, index) => {
              await promise;
              if (!whatsappChannel) {
                return;
              }
              const sendStartTime = Date.now();
              const result = await whatsappChannel.send(message);
              const sendDuration = Date.now() - sendStartTime;
              
              if (result.success) {
                trackBirthdaySent(this.metrics, 1);
                this.logger.info('Birthday message sent to WhatsApp successfully', {
                  messageId: result.messageId,
                });
                
                await this.logMessage(
                  result.messageId,
                  'birthday',
                  whatsappChannel,
                  message,
                  true,
                  sendDuration,
                  undefined,
                  { messageIndex: index }
                );
              } else {
                // Re-throw QR authentication required error - this is fatal
                if (result.error instanceof QRAuthenticationRequiredError) {
                  throw result.error;
                }
                
                // Throw error immediately - WhatsApp send failures are fatal (fail fast on first failure)
                const error = result.error instanceof Error 
                  ? new Error(`Failed to send birthday message to WhatsApp: ${result.error.message}`)
                  : new Error('Failed to send birthday message to WhatsApp');
                
                this.logger.error('Failed to send birthday message to WhatsApp', {
                  error: error.message,
                  messageIndex: index,
                });
                
                this.alerting.sendWhatsAppMessageFailedAlert(result.error ?? error, {
                  messageType: 'birthday',
                  messageId: result.messageId,
                });
                
                await this.logMessage(
                  result.messageId,
                  'birthday',
                  whatsappChannel,
                  message,
                  false,
                  sendDuration,
                  result.error ?? error,
                  { messageIndex: index }
                );
                
                throw error;
              }
              
              await new Promise(resolve => setTimeout(resolve, 1000));
            }, Promise.resolve());
            
          } else {
            // WhatsApp channel unavailable - this is fatal when there are birthdays to send
            const error = new Error('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
            this.logger.error('WhatsApp channel is not available', {
              reason: 'channel_unavailable',
              birthdaysCount: todaysBirthdays.length,
            });
            
            throw error;
          }
        } catch (error) {
          // Re-throw QR authentication required error - this is fatal
          if (error instanceof QRAuthenticationRequiredError) {
            throw error;
          }
          
          // Re-throw all errors - WhatsApp failures are fatal
          this.logger.error('Error sending birthday messages to WhatsApp', error);
          throw error;
        }
      }
      
      this.logger.info('Birthday check completed successfully!');
      
      this.lastRunTracker.updateLastRunDate();

      const monthlyDigestSent = !!monthlyBirthdays && whatsappChannel?.isAvailable();
      await this.metrics.recordDailyExecution(true, monthlyDigestSent);

      const executionDuration = Date.now() - executionStartTime;
      trackExecutionComplete(this.metrics, executionDuration, true);
    } catch (error) {
      this.logger.error('Error in birthday check', error);
      
      // Record failed execution in monitoring system
      await this.metrics.recordDailyExecution(false, false);
      
      // Track failed execution
      const executionDuration = Date.now() - executionStartTime;
      trackExecutionComplete(this.metrics, executionDuration, false);
      
      throw error; // Re-throw for caller to handle
    } finally {
      // Flush metrics before exiting
      try {
        await this.metrics.flush();
      } catch (error) {
        this.logger.error('Error flushing metrics', error);
        this.alerting.sendCloudWatchMetricsFailedAlert(error);
      }
      
      const executionDuration = Date.now() - executionStartTime;
      const TEN_MINUTES = 10 * 60 * 1000;
      if (executionDuration > TEN_MINUTES) {
        this.alerting.sendHighExecutionDurationAlert(executionDuration, { success: true });
      }

      // Flush all pending S3 writes before cleanup
      await this.flushPendingWrites(whatsappChannel);
      
      await this.cleanupWhatsAppClient(whatsappChannel);
    }
    }, {
      operation: 'runBirthdayCheck',
    });
  }
}

export function runBirthdayCheck(options: BirthdayOrchestratorServiceOptions): Promise<void> {
  const orchestrator = new BirthdayOrchestratorService(options);
  return orchestrator.runBirthdayCheck();
}

