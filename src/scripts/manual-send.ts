import birthdayService from '../services/birthday.js';
import { OutputChannelFactory } from '../factories/output-channel.factory.js';
import { getFullName } from '../utils/name-helpers.js';
import { logger } from '../utils/logger.js';
import { getMissedDates, updateLastRunDate } from '../utils/last-run-tracker.js';
import { startOfDay } from '../utils/date-helpers.js';

/**
 * Manual send script - always sends monthly digest + today's birthdays
 * 
 * This script is used for manual triggering (e.g., on bootup prompt)
 * It always sends the monthly digest regardless of the current date
 * It also checks for and sends missed days
 */

async function checkAndSendMissedDays(): Promise<void> {
  const missedDates = getMissedDates();
  
  if (missedDates.length === 0) {
    return;
  }

  // Only send the most recent missed day (last in array) to avoid spamming
  const lastMissedDate = missedDates[missedDates.length - 1];
  
  logger.info(`Found ${missedDates.length} missed day(s), sending messages for most recent: ${lastMissedDate.toISOString().split('T')[0]}`, {
    missedDates: missedDates.map(d => d.toISOString().split('T')[0]),
    sendingFor: lastMissedDate.toISOString().split('T')[0],
  });

  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

  try {
    whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
    if (!whatsappChannel.isAvailable()) {
      logger.info('WhatsApp channel not available, skipping missed days');
      return;
    }

    // Process only the last missed date
    try {
      const startDate = startOfDay(lastMissedDate);
      const endDate = startOfDay(lastMissedDate);
      const birthdays = await birthdayService.getBirthdays(startDate, endDate);

      if (birthdays.length > 0) {
        logger.info(`Sending ${birthdays.length} birthday message(s) for most recent missed date`, {
          date: lastMissedDate.toISOString().split('T')[0],
        });

        const birthdayMessages = birthdayService.formatTodaysBirthdayMessages(birthdays);
        for (const message of birthdayMessages) {
          const result = await whatsappChannel.send(message);
          if (result.success) {
            logger.info('Missed birthday message sent', {
              date: lastMissedDate.toISOString().split('T')[0],
            });
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        logger.info(`No birthdays on most recent missed date: ${lastMissedDate.toISOString().split('T')[0]}`);
      }
    } catch (error) {
      logger.error(`Error processing missed date: ${lastMissedDate.toISOString()}`, error);
    }
  } catch (error) {
    logger.error('Error checking missed days', error);
  } finally {
    if (whatsappChannel && 'destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await whatsappChannel.destroy();
      } catch (error) {
        logger.error('Error destroying WhatsApp client', error);
      }
    }
  }
}

async function manualSend(): Promise<void> {
  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

  try {
    // First, check for and send missed days
    await checkAndSendMissedDays();

    logger.info('Running manual send...');
    
    // Always get monthly digest (regardless of date)
    const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    // Send monthly digest to WhatsApp if available
    if (monthlyDigest) {
      logger.info('Sending monthly digest to WhatsApp group...');
      try {
        whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
        if (whatsappChannel.isAvailable()) {
          const result = await whatsappChannel.send(monthlyDigest);
          if (result.success) {
            logger.info('Monthly digest sent to WhatsApp successfully', {
              messageId: result.messageId,
            });
          } else {
            logger.warn('Failed to send monthly digest to WhatsApp', {
              error: result.error?.message,
            });
          }
        } else {
          logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
        }
      } catch (error) {
        logger.error('Error sending monthly digest to WhatsApp', error);
        // Don't fail the entire process if WhatsApp fails
      }
    }
    
    // Send today's birthday messages if any
    if (todaysBirthdays.length === 0) {
      logger.info('No birthdays today!');
    } else {
      logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
        birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
      
      // Send personal birthday messages to WhatsApp if available
      try {
        if (!whatsappChannel) {
          whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
        }
        if (whatsappChannel.isAvailable()) {
          const birthdayMessages = birthdayService.formatTodaysBirthdayMessages(todaysBirthdays);
          logger.info('Sending birthday messages to WhatsApp group...');
          
          // Send each birthday message separately for better personalization
          for (const message of birthdayMessages) {
            const result = await whatsappChannel.send(message);
            if (result.success) {
              logger.info('Birthday message sent to WhatsApp successfully', {
                messageId: result.messageId,
              });
            } else {
              logger.warn('Failed to send birthday message to WhatsApp', {
                error: result.error?.message,
              });
            }
            // Small delay between messages to avoid rate limiting
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
    
    logger.info('Manual send completed successfully!');
    
    // Update last run date after successful completion
    updateLastRunDate();
  } catch (error) {
    logger.error('Error in manual send', error);
    process.exit(1);
  } finally {
    // Give the client time to save the session before destroying
    // Wait a bit to ensure session is saved to disk
    if (whatsappChannel) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Cleanup WhatsApp client (without logging out to preserve session)
    if (whatsappChannel && 'destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
      try {
        await whatsappChannel.destroy();
      } catch (error) {
        logger.error('Error destroying WhatsApp client', error);
      }
    }
    // Exit after completion
    process.exit(0);
  }
}

// Run the manual send
manualSend();

