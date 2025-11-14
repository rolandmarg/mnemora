import { OutputChannelFactory } from '../factories/output-channel.factory.js';
import { today } from '../utils/date-helpers.js';
import { logger } from '../utils/logger.js';
import birthdayService from '../services/birthday.js';

/**
 * Script to get all birthdays throughout the year
 * 
 * 1. Reads all birthdays from Google Sheets
 * 2. Syncs all birthdays to Google Calendar (treating calendar as source of truth)
 * 3. Reads all birthdays from Google Calendar
 * 4. Sends all birthdays to output channel (console)
 */

async function getAllBirthdays(): Promise<void> {
  const ctx = {
    log: logger.child({ script: 'get-all-birthdays' }),
    outputChannel: OutputChannelFactory.createConsoleOutputChannel(),
  };

  if (!ctx.outputChannel.isAvailable()) {
    throw new Error('Output channel is not available');
  }
  
  // Compute year
  const todayDate = today();
  const year = todayDate.getFullYear();
  
  try {
    // Step 1: Read birthdays from sheets
    ctx.log.info('Step 1: Reading birthdays from Google Sheets...');
    
    const sheetBirthdays = await birthdayService.readFromSheets();
    ctx.log.info(`Found ${sheetBirthdays.length} birthday(s) in Google Sheets`);
    
    // Step 2: Sync birthdays to calendar (treating calendar as source of truth)
    ctx.log.info('Step 2: Syncing birthdays to Google Calendar...');
    
    // Write birthdays to calendar using service
    // The calendar source's write method handles duplicate checking internally
    const writeResult = await birthdayService.syncToCalendar(sheetBirthdays);
    ctx.log.info('Sync completed', { 
      synced: writeResult.added, 
      skipped: writeResult.skipped, 
      errors: writeResult.errors 
    });
    
    // Step 3: Read all birthdays from calendar
    ctx.log.info('Step 3: Reading all birthdays from Google Calendar...');
    
    ctx.log.info(`Fetching events from ${year}`);
    
    const birthdayRecords = await birthdayService.getAllBirthdaysForYear();
    
    // Step 4: Format and display birthdays
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

// Run the script
getAllBirthdays();
