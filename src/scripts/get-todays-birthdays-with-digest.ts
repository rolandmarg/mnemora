import { BirthdayService } from '../services/birthday.service.js';
import { appContext } from '../app-context.js';
import { getFullName } from '../utils/name-helpers.util.js';

async function getTodaysBirthdaysWithDigest(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);
  
  try {
    appContext.logger.info('Getting birthdays...');
    
    const { todaysBirthdays, monthlyBirthdays } = await birthdayService.getTodaysBirthdaysWithOptionalDigest();
    
    if (monthlyBirthdays && monthlyBirthdays.length > 0) {
      const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);
      appContext.logger.info('First day of month detected - generating monthly digest');
      appContext.logger.info('Monthly digest', { monthlyDigest });
    }
    
    if (todaysBirthdays.length === 0) {
      appContext.logger.info('No birthdays today!');
    } else {
      appContext.logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
        birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
    }
    
    appContext.logger.info('Completed successfully!');
  } catch (error) {
    appContext.logger.error('Error getting birthdays', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

getTodaysBirthdaysWithDigest();

