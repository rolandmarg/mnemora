import { BirthdayService } from '../services/birthday.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import calendarClient from '../clients/google-calendar.client.js';
import xrayClient from '../clients/xray.client.js';
import { getFullName } from '../utils/name-helpers.util.js';

async function getTodaysBirthdaysWithDigest(): Promise<void> {
  const birthdayService = new BirthdayService(logger, config, calendarClient, xrayClient);
  
  try {
    logger.info('Getting birthdays...');
    
    const { todaysBirthdays, monthlyBirthdays } = await birthdayService.getTodaysBirthdaysWithOptionalDigest();
    
    if (monthlyBirthdays && monthlyBirthdays.length > 0) {
      const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);
      logger.info('First day of month detected - generating monthly digest');
      logger.info('Monthly digest', { monthlyDigest });
    }
    
    if (todaysBirthdays.length === 0) {
      logger.info('No birthdays today!');
    } else {
      logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
        birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
    }
    
    logger.info('Completed successfully!');
  } catch (error) {
    logger.error('Error getting birthdays', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

getTodaysBirthdaysWithDigest();

