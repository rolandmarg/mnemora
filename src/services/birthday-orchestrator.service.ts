/**
 * Birthday Orchestrator Service
 * 
 * Orchestrates the daily birthday check process, including:
 * - Checking for missed days and sending recovery messages
 * - Sending monthly digest on the first of the month
 * - Sending today's birthday messages
 * - Managing execution lifecycle (metrics, monitoring, cleanup)
 * 
 * This service is reusable by both local execution and Lambda handler.
 */

// External dependencies
// (none)

// Internal modules - Services
import birthdayService from './birthday.service.js';

// Internal modules - Factories
import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';

// Internal modules - Clients
import { logger } from '../clients/logger.client.js';

// Internal modules - Services
import { monitoring } from './monitoring.service.js';
import { logSentMessage } from './message-logger.service.js';
import {
  trackExecutionStart,
  trackExecutionComplete,
  trackMissedDaysDetected,
  trackMonthlyDigestSent,
  trackBirthdaySent,
  metrics,
} from './metrics.service.js';

// Internal modules - Utils
import { getFullName } from '../utils/name-helpers.util.js';
import { startOfDay, isFirstDayOfMonth } from '../utils/date-helpers.util.js';
import { getMissedDates, updateLastRunDate } from '../utils/last-run-tracker.util.js';
import { initializeCorrelationId } from '../utils/correlation.util.js';
import {
  sendMissedDaysRecoveryFailedAlert,
  sendMonthlyDigestFailedAlert,
  sendWhatsAppMessageFailedAlert,
  sendCloudWatchMetricsFailedAlert,
  sendHighExecutionDurationAlert,
  alerting,
} from './alerting.service.js';

/**
 * Birthday Orchestrator Service
 * 
 * Manages the orchestration of daily birthday checks, including missed days recovery,
 * monthly digest sending, and today's birthday messages.
 */
class BirthdayOrchestratorService {
  /**
   * Get WhatsApp group ID from channel
   */
  private getGroupId(channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null): string {
    if (!channel || !channel.isAvailable()) {
      return 'unknown';
    }
    return (channel as any).config?.whatsapp?.groupId || 'unknown';
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
    await logSentMessage(messageId, messageType, groupId, content, success, duration, error, metadata).catch(() => {});
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
      logger.error('Error destroying WhatsApp client', error);
    }
  }

  private async checkAndSendMissedDays(): Promise<void> {
    const missedDates = await getMissedDates();
    
    if (missedDates.length === 0) {
      return;
    }

    trackMissedDaysDetected(missedDates.length);

    const lastMissedDate = missedDates[missedDates.length - 1];
    const dateStr = lastMissedDate.toISOString().split('T')[0];
    
    logger.info(`Found ${missedDates.length} missed day(s), sending messages for most recent: ${dateStr}`, {
      missedDates: missedDates.map(d => d.toISOString().split('T')[0]),
      sendingFor: dateStr,
    });

    let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

    try {
      whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
      if (!whatsappChannel.isAvailable()) {
        logger.info('WhatsApp channel not available, skipping missed days');
        return;
      }

      const startDate = startOfDay(lastMissedDate);
      const endDate = startOfDay(lastMissedDate);
      const birthdays = await birthdayService.getBirthdays(startDate, endDate);

      if (birthdays.length === 0) {
        logger.info(`No birthdays on most recent missed date: ${dateStr}`);
        return;
      }

      logger.info(`Sending ${birthdays.length} birthday message(s) for most recent missed date`, {
        date: dateStr,
      });

      const birthdayMessages = birthdayService.formatTodaysBirthdayMessages(birthdays);
      await birthdayMessages.reduce(async (promise, message) => {
        await promise;
        if (!whatsappChannel) return;
        const result = await whatsappChannel.send(message);
        if (result.success) {
          trackBirthdaySent(1);
          logger.info('Missed birthday message sent', { date: dateStr });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }, Promise.resolve());
    } catch (error) {
      logger.error('Error processing missed days', error);
      sendMissedDaysRecoveryFailedAlert(error, {
        missedDate: dateStr,
        stage: 'processing',
      });
    } finally {
      await this.cleanupWhatsAppClient(whatsappChannel);
    }
  }

  async runBirthdayCheck(): Promise<void> {
    const executionStartTime = Date.now();
    
    initializeCorrelationId();
    trackExecutionStart();

    let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

    try {
      // First, check for and send missed days
      await this.checkAndSendMissedDays();

      logger.info('Running birthday check...');
      
      const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysWithOptionalDigest();
      
      // Send monthly digest if it's the first day of the month
      if (monthlyDigest) {
        logger.info('First day of month detected - generating monthly digest');
        logger.info('Monthly digest', { monthlyDigest });
        
        try {
          whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
          if (whatsappChannel.isAvailable()) {
            logger.info('Sending monthly digest to WhatsApp group...');
            const result = await whatsappChannel.send(monthlyDigest);
            
            if (result.success) {
              trackMonthlyDigestSent();
              logger.info('Monthly digest sent to WhatsApp successfully', {
                messageId: result.messageId,
              });
              
              await this.logMessage(result.messageId, 'monthly-digest', whatsappChannel, monthlyDigest, true);
              
              await alerting.resolveAlert('monthly-digest-failed');
            } else {
              logger.warn('Failed to send monthly digest to WhatsApp', {
                error: result.error?.message,
              });
              
              if (isFirstDayOfMonth(new Date())) {
                sendMonthlyDigestFailedAlert(result.error, {
                  messageId: result.messageId,
                  isFirstOfMonth: true,
                });
              } else {
                sendWhatsAppMessageFailedAlert(result.error, {
                  messageType: 'monthly-digest',
                });
              }
            }
          } else {
            logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
            
            if (isFirstDayOfMonth(new Date())) {
              sendMonthlyDigestFailedAlert(new Error('WhatsApp channel not available'), {
                isFirstOfMonth: true,
                reason: 'channel_unavailable',
              });
            }
          }
        } catch (error) {
          logger.error('Error sending monthly digest to WhatsApp', error);
          
          if (isFirstDayOfMonth(new Date())) {
            sendMonthlyDigestFailedAlert(error, {
              isFirstOfMonth: true,
            });
          } else {
            sendWhatsAppMessageFailedAlert(error, {
              messageType: 'monthly-digest',
            });
          }
        }
      }
      
      if (todaysBirthdays.length === 0) {
        logger.info('No birthdays today!');
      } else {
        logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
          birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
        });
        
        try {
          if (!whatsappChannel) {
            whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
          }
          
          if (whatsappChannel.isAvailable()) {
            const birthdayMessages = birthdayService.formatTodaysBirthdayMessages(todaysBirthdays);
            logger.info('Sending birthday messages to WhatsApp group...');
            
            await birthdayMessages.reduce(async (promise, message, index) => {
              await promise;
              if (!whatsappChannel) return;
              const sendStartTime = Date.now();
              const result = await whatsappChannel.send(message);
              const sendDuration = Date.now() - sendStartTime;
              
              if (result.success) {
                trackBirthdaySent(1);
                logger.info('Birthday message sent to WhatsApp successfully', {
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
                logger.warn('Failed to send birthday message to WhatsApp', {
                  error: result.error?.message,
                });
                sendWhatsAppMessageFailedAlert(result.error, {
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
            logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
          }
        } catch (error) {
          logger.error('Error sending birthday messages to WhatsApp', error);
        }
      }
      
      logger.info('Birthday check completed successfully!');
      
      await updateLastRunDate();

      const monthlyDigestSent = !!monthlyDigest && whatsappChannel?.isAvailable();
      await monitoring.recordDailyExecution(true, monthlyDigestSent);

      const executionDuration = Date.now() - executionStartTime;
      trackExecutionComplete(executionDuration, true);
    } catch (error) {
      logger.error('Error in birthday check', error);
      
      // Record failed execution in monitoring system
      await monitoring.recordDailyExecution(false, false);
      
      // Track failed execution
      const executionDuration = Date.now() - executionStartTime;
      trackExecutionComplete(executionDuration, false);
      
      throw error; // Re-throw for caller to handle
    } finally {
      // Flush metrics before exiting
      try {
        await metrics.flush();
      } catch (error) {
        logger.error('Error flushing metrics', error);
        sendCloudWatchMetricsFailedAlert(error);
      }
      
      const executionDuration = Date.now() - executionStartTime;
      const TEN_MINUTES = 10 * 60 * 1000;
      if (executionDuration > TEN_MINUTES) {
        sendHighExecutionDurationAlert(executionDuration, { success: true });
      }

      await this.cleanupWhatsAppClient(whatsappChannel);
    }
  }
}

const birthdayOrchestratorService = new BirthdayOrchestratorService();
export default birthdayOrchestratorService;

export const runBirthdayCheck = () => birthdayOrchestratorService.runBirthdayCheck();

