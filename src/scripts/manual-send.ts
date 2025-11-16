import { BirthdayService } from '../services/birthday.service.js';
import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { LastRunTrackerService } from '../services/last-run-tracker.service.js';
import { appContext } from '../app-context.js';
import { getFullName } from '../utils/name-helpers.util.js';
import { isFirstDayOfMonth, startOfMonth, endOfMonth } from '../utils/date-helpers.util.js';
import { requireDevelopment, auditManualSend, SecurityError } from '../utils/security.util.js';

async function checkAndSendMissedDays(): Promise<void> {
  const lastRunTracker = new LastRunTrackerService(appContext);
  const birthdayService = new BirthdayService(appContext);
  
  const missedDates = await lastRunTracker.getMissedDates();
  
  if (missedDates.length === 0) {
    return;
  }

  const missedFirstOfMonths = missedDates.filter(date => isFirstDayOfMonth(date));
  
  if (missedFirstOfMonths.length === 0) {
    appContext.logger.info(`Found ${missedDates.length} missed day(s), but no missed 1st-of-month dates to recover`);
    return;
  }

  appContext.logger.info(`Found ${missedFirstOfMonths.length} missed 1st-of-month date(s) to recover`, {
    missedFirstOfMonths: missedFirstOfMonths.map(d => d.toISOString().split('T')[0]),
  });

  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;

  try {
    whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel(appContext);
    if (!whatsappChannel.isAvailable()) {
      appContext.logger.info('WhatsApp channel not available, skipping missed monthly digest recovery');
      return;
    }

    for (const missedFirst of missedFirstOfMonths) {
      const dateStr = missedFirst.toISOString().split('T')[0];
      try {
        const monthStart = startOfMonth(missedFirst);
        const monthEnd = endOfMonth(missedFirst);
        const monthlyBirthdays = await birthdayService.getBirthdays(monthStart, monthEnd);

        if (monthlyBirthdays.length === 0) {
          appContext.logger.info(`No birthdays found for missed monthly digest: ${dateStr}`);
          continue;
        }

        const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);
        
        appContext.logger.info(`Sending monthly digest for missed 1st-of-month: ${dateStr}`, {
          monthlyBirthdaysCount: monthlyBirthdays.length,
        });

        const result = await whatsappChannel.send(monthlyDigest);
        
        if (result.success) {
          appContext.logger.info('Missed monthly digest sent successfully', { date: dateStr });
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          appContext.logger.warn('Failed to send missed monthly digest', {
            date: dateStr,
            error: result.error?.message,
          });
        }
      } catch (error) {
        appContext.logger.error(`Error recovering monthly digest for ${dateStr}`, error);
      }
    }
  } catch (error) {
    appContext.logger.error('Error processing missed monthly digest recovery', error);
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

