import { BirthdayService } from '../services/birthday.service.js';
import { AlertingService } from '../services/alerting.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import calendarClient from '../clients/google-calendar.client.js';
import xrayClient from '../clients/xray.client.js';
import snsClient from '../clients/sns.client.js';
import { getFullName } from '../utils/name-helpers.util.js';

async function getMonthlyDigest(): Promise<void> {
  const alerting = new AlertingService({ logger, config, snsClient });
  const birthdayService = new BirthdayService({ logger, config, calendarClient, xrayClient, alerting });
  
  try {
    logger.info('Getting monthly digest...');
    
    const { todaysBirthdays, monthlyBirthdays } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (todaysBirthdays.length > 0) {
      logger.info('Today\'s birthdays', {
        birthdays: todaysBirthdays.map(record => getFullName(record.firstName, record.lastName)),
      });
    }
    
    if (monthlyBirthdays && monthlyBirthdays.length > 0) {
      const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);
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

