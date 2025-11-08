import birthdayService from '../services/birthday.js';
import { getFullName } from '../utils/name-helpers.js';
import { logger } from '../utils/logger.js';

/**
 * Script to get today's birthdays
 */

async function getTodaysBirthdays(): Promise<void> {
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

// Run the script
getTodaysBirthdays();

