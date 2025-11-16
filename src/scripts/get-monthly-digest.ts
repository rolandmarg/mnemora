import birthdayService from '../services/birthday.service.js';
import { getFullName } from '../utils/name-helpers.util.js';
import { logger } from '../clients/logger.client.js';

async function getMonthlyDigest(): Promise<void> {
  try {
    logger.info('Getting monthly digest...');
    
    const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (todaysBirthdays.length > 0) {
      logger.info('Today\'s birthdays', {
        birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
    }
    
    if (monthlyDigest) {
      logger.info('Monthly digest', { monthlyDigest });
    }
    
    logger.info('Completed successfully!');
  } catch (error) {
    logger.error('Error getting monthly digest', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

getMonthlyDigest();

