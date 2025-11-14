/**
 * Core Birthday Check Logic
 * 
 * Extracted from index.ts to be reusable by both local execution and Lambda handler.
 * This module does NOT call process.exit() - that's handled by the caller.
 */

// External dependencies
// (none)

// Internal modules - Services
import birthdayService from './services/birthday.js';

// Internal modules - Factories
import { OutputChannelFactory } from './factories/output-channel.factory.js';

// Internal modules - Utils
import { logger } from './utils/logger.js';
import { getFullName } from './utils/name-helpers.js';
import { startOfDay, isFirstDayOfMonth } from './utils/date-helpers.js';
import { getMissedDates, updateLastRunDate } from './utils/last-run-tracker.js';
import { initializeCorrelationId } from './utils/correlation.js';
import { monitoring } from './utils/monitoring.js';
import { logSentMessage } from './utils/message-logger.js';
import {
  trackExecutionStart,
  trackExecutionComplete,
  trackMissedDaysDetected,
  trackMonthlyDigestSent,
  trackBirthdaySent,
  metrics,
} from './utils/metrics.js';
import {
  sendMissedDaysRecoveryFailedAlert,
  sendMonthlyDigestFailedAlert,
  sendWhatsAppMessageFailedAlert,
  sendCloudWatchMetricsFailedAlert,
  sendHighExecutionDurationAlert,
  alerting,
} from './utils/alerting.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get WhatsApp group ID from channel
 */
function getGroupId(channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null): string {
  if (!channel || !channel.isAvailable()) {
    return 'unknown';
  }
  return (channel as any).config?.whatsapp?.groupId || 'unknown';
}

/**
 * Log and persist message (with error handling)
 */
async function logMessage(
  messageId: string | undefined,
  messageType: 'birthday' | 'monthly-digest' | 'other',
  channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null,
  content: string,
  success: boolean,
  duration?: number,
  error?: Error | unknown,
  metadata?: Record<string, unknown>
): Promise<void> {
  const groupId = getGroupId(channel);
  await logSentMessage(messageId, messageType, groupId, content, success, duration, error, metadata).catch(() => {
    // Ignore errors - message logging is non-critical
  });
}

/**
 * Cleanup WhatsApp client (preserves session)
 */
async function cleanupWhatsAppClient(
  channel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null
): Promise<void> {
  if (!channel || !('destroy' in channel) || typeof channel.destroy !== 'function') {
    return;
  }

  try {
    // Wait for session to be saved to disk
    await new Promise(resolve => setTimeout(resolve, 2000));
    await channel.destroy();
  } catch (error) {
    logger.error('Error destroying WhatsApp client', error);
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Check and send messages for missed days
 * 
 * Only processes the most recent missed day to avoid spamming the group.
 */
async function checkAndSendMissedDays(): Promise<void> {
  const missedDates = await getMissedDates();
  
  if (missedDates.length === 0) {
    return;
  }

  // Track missed days
  trackMissedDaysDetected(missedDates.length);

  // Only send the most recent missed day (last in array) to avoid spamming
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

    // Process only the last missed date
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
    for (const message of birthdayMessages) {
      const result = await whatsappChannel.send(message);
      if (result.success) {
        trackBirthdaySent(1);
        logger.info('Missed birthday message sent', { date: dateStr });
      }
      // Rate limiting: wait 1 second between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    logger.error('Error processing missed days', error);
    sendMissedDaysRecoveryFailedAlert(error, {
      missedDate: dateStr,
      stage: 'processing',
    });
  } finally {
    // Cleanup: give WhatsApp client time to save session before destroying
    await cleanupWhatsAppClient(whatsappChannel);
  }
}

/**
 * Run the birthday check
 * 
 * This is the core function that can be called from both local execution and Lambda.
 * 
 * @returns Promise that resolves when check is complete
 * @throws Error if check fails
 */
export async function runBirthdayCheck(): Promise<void> {
  const executionStartTime = Date.now();
  
  // Initialize correlation ID for this execution
  initializeCorrelationId();
  trackExecutionStart();

  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

  try {
    // First, check for and send missed days
    await checkAndSendMissedDays();

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
            
            // Log and persist monthly digest message
            await logMessage(result.messageId, 'monthly-digest', whatsappChannel, monthlyDigest, true);
            
            // Resolve monthly digest alert if it was active
            await alerting.resolveAlert('monthly-digest-failed');
          } else {
            logger.warn('Failed to send monthly digest to WhatsApp', {
              error: result.error?.message,
            });
            
            // If it's the 1st of month, this is CRITICAL
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
          
          // If it's the 1st of month and WhatsApp unavailable, send CRITICAL alert
          if (isFirstDayOfMonth(new Date())) {
            sendMonthlyDigestFailedAlert(new Error('WhatsApp channel not available'), {
              isFirstOfMonth: true,
              reason: 'channel_unavailable',
            });
          }
        }
      } catch (error) {
        logger.error('Error sending monthly digest to WhatsApp', error);
        
        // If it's the 1st of month, this is CRITICAL
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
    
    // Send today's birthday messages
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
          
          // Send each birthday message separately for better personalization
          for (const message of birthdayMessages) {
            const sendStartTime = Date.now();
            const result = await whatsappChannel.send(message);
            const sendDuration = Date.now() - sendStartTime;
            
            if (result.success) {
              trackBirthdaySent(1);
              logger.info('Birthday message sent to WhatsApp successfully', {
                messageId: result.messageId,
              });
              
              // Log and persist birthday message
              await logMessage(
                result.messageId,
                'birthday',
                whatsappChannel,
                message,
                true,
                sendDuration,
                undefined,
                { messageIndex: birthdayMessages.indexOf(message) }
              );
            } else {
              logger.warn('Failed to send birthday message to WhatsApp', {
                error: result.error?.message,
              });
              sendWhatsAppMessageFailedAlert(result.error, {
                messageType: 'birthday',
                messageId: result.messageId,
              });
              
              // Log and persist failed birthday message
              await logMessage(
                result.messageId,
                'birthday',
                whatsappChannel,
                message,
                false,
                sendDuration,
                result.error,
                { messageIndex: birthdayMessages.indexOf(message) }
              );
            }
            
            // Rate limiting: wait 1 second between messages
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
        }
      } catch (error) {
        logger.error('Error sending birthday messages to WhatsApp', error);
        // Don't fail the entire process if WhatsApp fails
      }
    }
    
    logger.info('Birthday check completed successfully!');
    
    // Update last run date after successful completion
    await updateLastRunDate();

    // Record execution in monitoring system
    const monthlyDigestSent = !!monthlyDigest && whatsappChannel?.isAvailable();
    await monitoring.recordDailyExecution(true, monthlyDigestSent);

    // Track successful execution
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
    
    // Check execution duration and alert if too high (>10 minutes)
    const executionDuration = Date.now() - executionStartTime;
    const TEN_MINUTES = 10 * 60 * 1000;
    if (executionDuration > TEN_MINUTES) {
      sendHighExecutionDurationAlert(executionDuration, { success: true });
    }

    // Cleanup: Give WhatsApp client time to save session before destroying
    await cleanupWhatsAppClient(whatsappChannel);
  }
}
