import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { BirthdayService } from '../services/birthday.service.js';
import { AlertingService } from '../services/alerting.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import GoogleCalendarClient from '../clients/google-calendar.client.js';
import xrayClient from '../clients/xray.client.js';
import snsClient from '../clients/sns.client.js';
import { today } from '../utils/date-helpers.util.js';

async function getAllBirthdays(): Promise<void> {
  const calendarClient = new GoogleCalendarClient(config, xrayClient);
  const alerting = new AlertingService({ logger, config, snsClient });
  const birthdayService = new BirthdayService({ logger, config, calendarClient, xrayClient, alerting });
  const outputChannel = OutputChannelFactory.createConsoleOutputChannel();

  if (!outputChannel.isAvailable()) {
    throw new Error('Output channel is not available');
  }
  
  const todayDate = today();
  const year = todayDate.getFullYear();
  
  try {
    logger.info('Step 1: Reading birthdays from Google Sheets...');
    
    const sheetBirthdays = await birthdayService.readFromSheets();
    logger.info(`Found ${sheetBirthdays.length} birthday(s) in Google Sheets`);
    
    logger.info('Step 2: Syncing birthdays to Google Calendar...');
    
    const writeResult = await birthdayService.syncToCalendar(sheetBirthdays);
    logger.info('Sync completed', { 
      synced: writeResult.added, 
      skipped: writeResult.skipped, 
      errors: writeResult.errors 
    });
    
    logger.info('Step 3: Reading all birthdays from Google Calendar...');
    
    logger.info(`Fetching events from ${year}`);
    
    const birthdayRecords = await birthdayService.getAllBirthdaysForYear();
    
    logger.info('Step 4: Displaying all birthdays...');
    
    if (birthdayRecords.length === 0) {
      logger.info('Completed successfully - no birthdays found');
    } else {
    logger.info(`Found ${birthdayRecords.length} birthday(s) in ${year}`);
    }
    
    await birthdayService.formatAndSendAllBirthdays(outputChannel, birthdayRecords);
    
    logger.info('Completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error getting all birthdays', error);
    process.exit(1);
  }
}

getAllBirthdays();
