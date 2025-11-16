import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { today } from '../utils/date-helpers.util.js';
import { logger } from '../clients/logger.client.js';
import birthdayService from '../services/birthday.service.js';

async function getAllBirthdays(): Promise<void> {
  const ctx = {
    log: logger.child({ script: 'get-all-birthdays' }),
    outputChannel: OutputChannelFactory.createConsoleOutputChannel(),
  };

  if (!ctx.outputChannel.isAvailable()) {
    throw new Error('Output channel is not available');
  }
  
  const todayDate = today();
  const year = todayDate.getFullYear();
  
  try {
    ctx.log.info('Step 1: Reading birthdays from Google Sheets...');
    
    const sheetBirthdays = await birthdayService.readFromSheets();
    ctx.log.info(`Found ${sheetBirthdays.length} birthday(s) in Google Sheets`);
    
    ctx.log.info('Step 2: Syncing birthdays to Google Calendar...');
    
    const writeResult = await birthdayService.syncToCalendar(sheetBirthdays);
    ctx.log.info('Sync completed', { 
      synced: writeResult.added, 
      skipped: writeResult.skipped, 
      errors: writeResult.errors 
    });
    
    ctx.log.info('Step 3: Reading all birthdays from Google Calendar...');
    
    ctx.log.info(`Fetching events from ${year}`);
    
    const birthdayRecords = await birthdayService.getAllBirthdaysForYear();
    
    ctx.log.info('Step 4: Displaying all birthdays...');
    
    if (birthdayRecords.length === 0) {
      ctx.log.info('Completed successfully - no birthdays found');
    } else {
    ctx.log.info(`Found ${birthdayRecords.length} birthday(s) in ${year}`);
    }
    
    await birthdayService.formatAndSendAllBirthdays(ctx.outputChannel, birthdayRecords);
    
    ctx.log.info('Completed successfully');
    process.exit(0);
  } catch (error) {
    ctx.log.error('Error getting all birthdays', error);
    process.exit(1);
  }
}

getAllBirthdays();
