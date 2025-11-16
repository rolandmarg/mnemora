import { BirthdayService } from '../services/birthday.service.js';
import { appContext } from '../app-context.js';
import { getFullName } from '../utils/name-helpers.util.js';

async function getTodaysBirthdays(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);
  
  try {
    appContext.logger.info('Getting today\'s birthdays...');
    
    const birthdays = await birthdayService.getTodaysBirthdays();
    
    if (birthdays.length === 0) {
      appContext.logger.info('No birthdays today!');
    } else {
      appContext.logger.info(`Found ${birthdays.length} birthday(s) today`, {
        birthdays: birthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
    }
    
    appContext.logger.info('Completed successfully!');
  } catch (error) {
    appContext.logger.error('Error getting today\'s birthdays', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

getTodaysBirthdays();

