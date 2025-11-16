/**
 * Birthday Orchestrator Service
 * 
 * Orchestrates the daily birthday check process, including:
 * - Checking for missed 1st-of-month dates and recovering monthly digests
 * - Sending monthly digest on the first of the month
 * - Sending today's birthday messages
 * - Managing execution lifecycle (metrics, monitoring, cleanup)
 * 
 * This service is reusable by both local execution and Lambda handler.
 */

import { BirthdayService } from './birthday.service.js';
import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { MonitoringService } from './monitoring.service.js';
import { logSentMessage } from './message-logger.service.js';
import {
  MetricsCollector,
  trackExecutionStart,
  trackExecutionComplete,
  trackMissedDaysDetected,
  trackMonthlyDigestSent,
  trackBirthdaySent,
} from './metrics.service.js';
import { AlertingService } from './alerting.service.js';
import { LastRunTrackerService } from './last-run-tracker.service.js';
import { getFullName } from '../utils/name-helpers.util.js';
import { isFirstDayOfMonth, startOfMonth, endOfMonth } from '../utils/date-helpers.util.js';
import { initializeCorrelationId } from '../utils/correlation.util.js';
import type { AppContext } from '../app-context.js';

class BirthdayOrchestratorService {
  private readonly birthdayService: BirthdayService;
  private readonly monitoring: MonitoringService;
  private readonly metrics: MetricsCollector;
  private readonly alerting: AlertingService;
  private readonly lastRunTracker: LastRunTrackerService;

  constructor(private readonly ctx: AppContext) {
    this.birthdayService = new BirthdayService(ctx);
    this.monitoring = new MonitoringService(ctx);
    this.metrics = new MetricsCollector(ctx);
    this.alerting = new AlertingService(ctx);
    this.lastRunTracker = new LastRunTrackerService(ctx);
  }

  private getGroupId(channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null): string {
    if (!channel?.isAvailable()) {
      return 'unknown';
    }
    return (channel as { config?: { whatsapp?: { groupId?: string } } }).config?.whatsapp?.groupId ?? 'unknown';
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
    await logSentMessage(this.ctx, messageId, messageType, groupId, content, success, duration, error, metadata).catch(() => {});
  }

  private async cleanupWhatsAppClient(
    channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null
  ): Promise<void> {
    if (!channel || !('destroy' in channel) || typeof channel.destroy !== 'function') {
      return;
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await channel.destroy();
    } catch (error) {
      this.ctx.logger.error('Error destroying WhatsApp client', error);
    }
  }

  private async checkAndSendMissedDays(): Promise<void> {
    const missedDates = await this.lastRunTracker.getMissedDates();
    
    if (missedDates.length === 0) {
      return;
    }

    const missedFirstOfMonths = missedDates.filter(date => isFirstDayOfMonth(date));
    
    if (missedFirstOfMonths.length === 0) {
      this.ctx.logger.info(`Found ${missedDates.length} missed day(s), but no missed 1st-of-month dates to recover`);
      return;
    }

    // Only recover the latest (most recent) missed 1st-of-month to avoid spamming
    const latestMissedFirst = missedFirstOfMonths.sort((a, b) => b.getTime() - a.getTime())[0];
    const dateStr = latestMissedFirst.toISOString().split('T')[0];

    trackMissedDaysDetected(this.metrics, missedFirstOfMonths.length);

    this.ctx.logger.info(`Found ${missedFirstOfMonths.length} missed 1st-of-month date(s), recovering latest: ${dateStr}`, {
      missedFirstOfMonths: missedFirstOfMonths.map(d => d.toISOString().split('T')[0]),
      recovering: dateStr,
    });

    let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

    try {
      whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel(this.ctx);
      if (!whatsappChannel.isAvailable()) {
        this.ctx.logger.info('WhatsApp channel not available, skipping missed monthly digest recovery');
        return;
      }

      try {
        const monthStart = startOfMonth(latestMissedFirst);
        const monthEnd = endOfMonth(latestMissedFirst);
        const monthlyBirthdays = await this.birthdayService.getBirthdays(monthStart, monthEnd);

        if (monthlyBirthdays.length === 0) {
          this.ctx.logger.info(`No birthdays found for missed monthly digest: ${dateStr}`);
          return;
        }

        const monthlyDigest = this.birthdayService.formatMonthlyDigest(monthlyBirthdays);
        
        this.ctx.logger.info(`Sending monthly digest for missed 1st-of-month: ${dateStr}`, {
          monthlyBirthdaysCount: monthlyBirthdays.length,
        });

        const result = await whatsappChannel.send(monthlyDigest);
        
        if (result.success) {
          trackMonthlyDigestSent(this.metrics);
          this.ctx.logger.info('Missed monthly digest sent successfully', { date: dateStr });
          
          await this.logMessage(result.messageId, 'monthly-digest', whatsappChannel, monthlyDigest, true);
        } else {
          this.ctx.logger.warn('Failed to send missed monthly digest', {
            date: dateStr,
            error: result.error?.message,
          });
          this.alerting.sendMonthlyDigestFailedAlert(result.error, {
            date: dateStr,
            isRecovery: true,
          });
        }
      } catch (error) {
        this.ctx.logger.error(`Error recovering monthly digest for ${dateStr}`, error);
        this.alerting.sendMissedDaysRecoveryFailedAlert(error, {
          missedDate: dateStr,
          stage: 'monthly-digest-recovery',
        });
      }
    } catch (error) {
      this.ctx.logger.error('Error processing missed monthly digest recovery', error);
      this.alerting.sendMissedDaysRecoveryFailedAlert(error, {
        stage: 'initialization',
      });
    } finally {
      await this.cleanupWhatsAppClient(whatsappChannel);
    }
  }

  async runBirthdayCheck(): Promise<void> {
    const executionStartTime = Date.now();
    
    initializeCorrelationId();
    trackExecutionStart(this.metrics);

    let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

    try {
      // First, check for and send missed days
      await this.checkAndSendMissedDays();

      // Sync from Sheets to Calendar (optional - continues even if sync fails)
      try {
        await this.birthdayService.trySyncFromSheets();
      } catch (error) {
        this.ctx.logger.warn('Unexpected error during Sheets sync', error);
      }

      this.ctx.logger.info('Running birthday check...');
      
      const { todaysBirthdays, monthlyBirthdays } = await this.birthdayService.getTodaysBirthdaysWithOptionalDigest();
      
      // Send monthly digest if it's the first day of the month
      if (monthlyBirthdays) {
        const monthlyDigest = this.birthdayService.formatMonthlyDigest(monthlyBirthdays);
        this.ctx.logger.info('First day of month detected - generating monthly digest');
        this.ctx.logger.info('Monthly digest', { monthlyDigest });
        
        try {
          whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel(this.ctx);
          if (whatsappChannel.isAvailable()) {
            this.ctx.logger.info('Sending monthly digest to WhatsApp group...');
            const result = await whatsappChannel.send(monthlyDigest);
            
            if (result.success) {
              trackMonthlyDigestSent(this.metrics);
              this.ctx.logger.info('Monthly digest sent to WhatsApp successfully', {
                messageId: result.messageId,
              });
              
              await this.logMessage(result.messageId, 'monthly-digest', whatsappChannel, monthlyDigest, true);
              
              await this.alerting.resolveAlert('monthly-digest-failed');
            } else {
              this.ctx.logger.warn('Failed to send monthly digest to WhatsApp', {
                error: result.error?.message,
              });
              
              if (isFirstDayOfMonth(new Date())) {
                this.alerting.sendMonthlyDigestFailedAlert(result.error, {
                  messageId: result.messageId,
                  isFirstOfMonth: true,
                });
              } else {
                this.alerting.sendWhatsAppMessageFailedAlert(result.error, {
                  messageType: 'monthly-digest',
                });
              }
            }
          } else {
            this.ctx.logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
            
            if (isFirstDayOfMonth(new Date())) {
              this.alerting.sendMonthlyDigestFailedAlert(new Error('WhatsApp channel not available'), {
                isFirstOfMonth: true,
                reason: 'channel_unavailable',
              });
            }
          }
        } catch (error) {
          this.ctx.logger.error('Error sending monthly digest to WhatsApp', error);
          
          if (isFirstDayOfMonth(new Date())) {
            this.alerting.sendMonthlyDigestFailedAlert(error, {
              isFirstOfMonth: true,
            });
          } else {
            this.alerting.sendWhatsAppMessageFailedAlert(error, {
              messageType: 'monthly-digest',
            });
          }
        }
      }
      
      if (todaysBirthdays.length === 0) {
        this.ctx.logger.info('No birthdays today!');
      } else {
        this.ctx.logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
          birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
        });
        
        try {
          whatsappChannel ??= OutputChannelFactory.createWhatsAppOutputChannel(this.ctx);
          
          if (whatsappChannel.isAvailable()) {
            const birthdayMessages = this.birthdayService.formatTodaysBirthdayMessages(todaysBirthdays);
            this.ctx.logger.info('Sending birthday messages to WhatsApp group...');
            
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
                this.ctx.logger.info('Birthday message sent to WhatsApp successfully', {
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
                this.ctx.logger.warn('Failed to send birthday message to WhatsApp', {
                  error: result.error?.message,
                });
                this.alerting.sendWhatsAppMessageFailedAlert(result.error, {
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
                  result.error,
                  { messageIndex: index }
                );
              }
              
              await new Promise(resolve => setTimeout(resolve, 1000));
            }, Promise.resolve());
          } else {
            this.ctx.logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
          }
        } catch (error) {
          this.ctx.logger.error('Error sending birthday messages to WhatsApp', error);
        }
      }
      
      this.ctx.logger.info('Birthday check completed successfully!');
      
      await this.lastRunTracker.updateLastRunDate();

      const monthlyDigestSent = !!monthlyBirthdays && whatsappChannel?.isAvailable();
      await this.monitoring.recordDailyExecution(true, monthlyDigestSent);

      const executionDuration = Date.now() - executionStartTime;
      trackExecutionComplete(this.metrics, executionDuration, true);
    } catch (error) {
      this.ctx.logger.error('Error in birthday check', error);
      
      // Record failed execution in monitoring system
      await this.monitoring.recordDailyExecution(false, false);
      
      // Track failed execution
      const executionDuration = Date.now() - executionStartTime;
      trackExecutionComplete(this.metrics, executionDuration, false);
      
      throw error; // Re-throw for caller to handle
    } finally {
      // Flush metrics before exiting
      try {
        await this.metrics.flush();
      } catch (error) {
        this.ctx.logger.error('Error flushing metrics', error);
        this.alerting.sendCloudWatchMetricsFailedAlert(error);
      }
      
      const executionDuration = Date.now() - executionStartTime;
      const TEN_MINUTES = 10 * 60 * 1000;
      if (executionDuration > TEN_MINUTES) {
        this.alerting.sendHighExecutionDurationAlert(executionDuration, { success: true });
      }

      await this.cleanupWhatsAppClient(whatsappChannel);
    }
  }
}

export function runBirthdayCheck(ctx: AppContext): Promise<void> {
  const orchestrator = new BirthdayOrchestratorService(ctx);
  return orchestrator.runBirthdayCheck();
}

