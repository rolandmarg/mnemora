import birthdayService from '../services/birthday.js';
import { getFullName } from '../utils/name-helpers.js';
import { logger } from '../utils/logger.js';

/**
 * Script to get today's birthdays and optionally monthly digest if it's first day of month
 */

async function getTodaysBirthdaysWithDigest(): Promise<void> {
  try {
    logger.info('Getting birthdays...');
    
    const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysWithOptionalDigest();
    
    if (monthlyDigest) {
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

// Run the script
getTodaysBirthdaysWithDigest();

