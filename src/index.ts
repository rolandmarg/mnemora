import birthdayService from './services/birthday.js';
import { getFullName } from './utils/name-helpers.js';
import { logger } from './utils/logger.js';

/**
 * Manual execution mode - runs once and exits
 * Scheduling is disabled. Run manually with: npm start or npm run dev
 */

async function runBirthdayCheck(): Promise<void> {
  try {
    logger.info('Running birthday check...');
    
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
    
    logger.info('Birthday check completed successfully!');
  } catch (error) {
    logger.error('Error in birthday check', error);
    process.exit(1);
  } finally {
    // Exit after completion
    process.exit(0);
  }
}

// Run the check
runBirthdayCheck();

