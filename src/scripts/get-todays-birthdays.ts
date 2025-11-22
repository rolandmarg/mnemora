import { BirthdayService } from '../services/birthday.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import calendarClient from '../clients/google-calendar.client.js';
import xrayClient from '../clients/xray.client.js';
import { getFullName } from '../utils/name-helpers.util.js';

async function getTodaysBirthdays(): Promise<void> {
  const birthdayService = new BirthdayService(logger, config, calendarClient, xrayClient);
  
  try {
    logger.info('Getting today\'s birthdays...');
    
    const birthdays = await birthdayService.getTodaysBirthdays();
    
    if (birthdays.length === 0) {
      logger.info('No birthdays today!');
    } else {
      logger.info(`Found ${birthdays.length} birthday(s) today`, {
        birthdays: birthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
    }
    
    logger.info('Completed successfully!');
  } catch (error) {
    logger.error('Error getting today\'s birthdays', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

getTodaysBirthdays();

