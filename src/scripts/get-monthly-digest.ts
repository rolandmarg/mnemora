import { BirthdayService } from '../services/birthday.service.js';
import { appContext } from '../app-context.js';
import { getFullName } from '../utils/name-helpers.util.js';

async function getMonthlyDigest(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);
  
  try {
    appContext.logger.info('Getting monthly digest...');
    
    const { todaysBirthdays, monthlyBirthdays } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (todaysBirthdays.length > 0) {
      appContext.logger.info('Today\'s birthdays', {
        birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
    }
    
    if (monthlyBirthdays && monthlyBirthdays.length > 0) {
      const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);
      appContext.logger.info('Monthly digest', { monthlyDigest });
    }
    
    appContext.logger.info('Completed successfully!');
  } catch (error) {
    appContext.logger.error('Error getting monthly digest', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

getMonthlyDigest();

