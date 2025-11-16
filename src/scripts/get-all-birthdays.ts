import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { BirthdayService } from '../services/birthday.service.js';
import { appContext } from '../app-context.js';
import { today } from '../utils/date-helpers.util.js';

async function getAllBirthdays(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);
  const outputChannel = OutputChannelFactory.createConsoleOutputChannel();

  if (!outputChannel.isAvailable()) {
    throw new Error('Output channel is not available');
  }
  
  const todayDate = today();
  const year = todayDate.getFullYear();
  
  try {
    appContext.logger.info('Step 1: Reading birthdays from Google Sheets...');
    
    const sheetBirthdays = await birthdayService.readFromSheets();
    appContext.logger.info(`Found ${sheetBirthdays.length} birthday(s) in Google Sheets`);
    
    appContext.logger.info('Step 2: Syncing birthdays to Google Calendar...');
    
    const writeResult = await birthdayService.syncToCalendar(sheetBirthdays);
    appContext.logger.info('Sync completed', { 
      synced: writeResult.added, 
      skipped: writeResult.skipped, 
      errors: writeResult.errors 
    });
    
    appContext.logger.info('Step 3: Reading all birthdays from Google Calendar...');
    
    appContext.logger.info(`Fetching events from ${year}`);
    
    const birthdayRecords = await birthdayService.getAllBirthdaysForYear();
    
    appContext.logger.info('Step 4: Displaying all birthdays...');
    
    if (birthdayRecords.length === 0) {
      appContext.logger.info('Completed successfully - no birthdays found');
    } else {
    appContext.logger.info(`Found ${birthdayRecords.length} birthday(s) in ${year}`);
    }
    
    await birthdayService.formatAndSendAllBirthdays(outputChannel, birthdayRecords);
    
    appContext.logger.info('Completed successfully');
    process.exit(0);
  } catch (error) {
    appContext.logger.error('Error getting all birthdays', error);
    process.exit(1);
  }
}

getAllBirthdays();
