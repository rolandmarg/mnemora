import { BirthdayService } from '../services/birthday.service.js';
import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { LastRunTrackerService } from '../services/last-run-tracker.service.js';
import { appContext } from '../app-context.js';
import { getFullName } from '../utils/name-helpers.util.js';
import { startOfDay } from '../utils/date-helpers.util.js';
import { requireDevelopment, auditManualSend, SecurityError } from '../utils/security.util.js';

async function checkAndSendMissedDays(): Promise<void> {
  const lastRunTracker = new LastRunTrackerService(appContext);
  const birthdayService = new BirthdayService(appContext);
  
  const missedDates = await lastRunTracker.getMissedDates();
  
  if (missedDates.length === 0) {
    return;
  }

  const lastMissedDate = missedDates[missedDates.length - 1];
  
  appContext.logger.info(`Found ${missedDates.length} missed day(s), sending messages for most recent: ${lastMissedDate.toISOString().split('T')[0]}`, {
    missedDates: missedDates.map(d => d.toISOString().split('T')[0]),
    sendingFor: lastMissedDate.toISOString().split('T')[0],
  });

  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

  try {
    whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel(appContext);
    if (!whatsappChannel.isAvailable()) {
      appContext.logger.info('WhatsApp channel not available, skipping missed days');
      return;
    }

    try {
      const startDate = startOfDay(lastMissedDate);
      const endDate = startOfDay(lastMissedDate);
      const birthdays = await birthdayService.getBirthdays(startDate, endDate);

      if (birthdays.length > 0) {
        appContext.logger.info(`Sending ${birthdays.length} birthday message(s) for most recent missed date`, {
          date: lastMissedDate.toISOString().split('T')[0],
        });

        const birthdayMessages = birthdayService.formatTodaysBirthdayMessages(birthdays);
        await birthdayMessages.reduce(async (promise, message) => {
          await promise;
          if (!whatsappChannel) {
            return;
          }
          const result = await whatsappChannel.send(message);
          if (result.success) {
            appContext.logger.info('Missed birthday message sent', {
              date: lastMissedDate.toISOString().split('T')[0],
            });
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }, Promise.resolve());
      } else {
        appContext.logger.info(`No birthdays on most recent missed date: ${lastMissedDate.toISOString().split('T')[0]}`);
      }
    } catch (error) {
      appContext.logger.error(`Error processing missed date: ${lastMissedDate.toISOString()}`, error);
    }
  } catch (error) {
    appContext.logger.error('Error checking missed days', error);
  } finally {
    if (whatsappChannel && 'destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await whatsappChannel.destroy();
      } catch (error) {
        appContext.logger.error('Error destroying WhatsApp client', error);
      }
    }
  }
}

async function manualSend(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);
  const lastRunTracker = new LastRunTrackerService(appContext);
  
  try {
    requireDevelopment(appContext);
  } catch (error) {
    if (error instanceof SecurityError) {
      auditManualSend(appContext, 'manual-send.ts', {
        blocked: true,
        reason: 'production_environment',
      });
      appContext.logger.error('SECURITY: Manual send blocked in production', {
        script: 'manual-send.ts',
        environment: appContext.environment,
      });
      console.error('\n❌ SECURITY ERROR: Manual send is disabled in production\n');
      console.error('Manual send scripts are disabled in production environment.');
      console.error('Set NODE_ENV=development to enable manual sending.\n');
      process.exit(1);
    }
    throw error;
  }

  auditManualSend(appContext, 'manual-send.ts', {
    blocked: false,
    environment: appContext.environment,
  });

  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

  try {
    // First, check for and send missed days
    await checkAndSendMissedDays();

    appContext.logger.info('Running manual send...');
    
    const { todaysBirthdays, monthlyBirthdays } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (monthlyBirthdays && monthlyBirthdays.length > 0) {
      const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);
      appContext.logger.info('Sending monthly digest to WhatsApp group...');
      try {
        whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel(appContext);
        if (whatsappChannel.isAvailable()) {
          const result = await whatsappChannel.send(monthlyDigest);
          if (result.success) {
            appContext.logger.info('Monthly digest sent to WhatsApp successfully', {
              messageId: result.messageId,
            });
          } else {
            appContext.logger.warn('Failed to send monthly digest to WhatsApp', {
              error: result.error?.message,
            });
          }
        } else {
          appContext.logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
        }
      } catch (error) {
        appContext.logger.error('Error sending monthly digest to WhatsApp', error);
      }
    }
    
    if (todaysBirthdays.length === 0) {
      appContext.logger.info('No birthdays today!');
    } else {
      appContext.logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
        birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
      
      try {
        whatsappChannel ??= OutputChannelFactory.createWhatsAppOutputChannel(appContext);
        if (whatsappChannel.isAvailable()) {
          const birthdayMessages = birthdayService.formatTodaysBirthdayMessages(todaysBirthdays);
          appContext.logger.info('Sending birthday messages to WhatsApp group...');
          
          await birthdayMessages.reduce(async (promise, message) => {
            await promise;
            if (!whatsappChannel) {
              return;
            }
            const result = await whatsappChannel.send(message);
            if (result.success) {
              appContext.logger.info('Birthday message sent to WhatsApp successfully', {
                messageId: result.messageId,
              });
            } else {
              appContext.logger.warn('Failed to send birthday message to WhatsApp', {
                error: result.error?.message,
              });
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }, Promise.resolve());
        } else {
          appContext.logger.info('WhatsApp channel is not available (WHATSAPP_GROUP_ID not configured)');
        }
      } catch (error) {
        appContext.logger.error('Error sending birthday messages to WhatsApp', error);
      }
    }
    
    appContext.logger.info('Manual send completed successfully!');
    
    await lastRunTracker.updateLastRunDate();
  } catch (error) {
    appContext.logger.error('Error in manual send', error);
    process.exit(1);
  } finally {
    if (whatsappChannel) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (whatsappChannel && 'destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
      try {
        await whatsappChannel.destroy();
      } catch (error) {
        appContext.logger.error('Error destroying WhatsApp client', error);
      }
    }
    process.exit(0);
  }
}

manualSend();

