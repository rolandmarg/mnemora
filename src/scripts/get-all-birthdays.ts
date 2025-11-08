import { DataSourceFactory } from '../factories/data-source.factory.js';
import { OutputChannelFactory } from '../factories/output-channel.factory.js';
import { today, startOfYear, endOfYear, formatDateShort } from '../utils/date.js';
import { logger } from '../utils/logger.js';
import type { BirthdayRecord } from '../utils/birthday-helpers.js';

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
    outputChannel: OutputChannelFactory.create('console'),
    sheetsSource: DataSourceFactory.create('sheets'),
    calendarSource: DataSourceFactory.create('calendar'),
  };

  if (!ctx.outputChannel.isAvailable()) {
    throw new Error('Output channel is not available');
  }
  if (!ctx.sheetsSource.isAvailable()) {
    throw new Error('Google Sheets is not configured');
  }
  if (!ctx.calendarSource.isAvailable()) {
    throw new Error('Google Calendar is not configured');
  }
  if (!ctx.calendarSource.write) {
    throw new Error('Calendar source does not support writing');
  }
  
  // Compute date range
  const todayDate = today();
  const yearStart = startOfYear(todayDate);
  const yearEnd = endOfYear(todayDate);
  const year = yearStart.getFullYear();
  
  try {
    // Step 1: Read birthdays from sheets
    ctx.log.info('Step 1: Reading birthdays from Google Sheets...');
    
    const sheetBirthdays = await ctx.sheetsSource.read({ skipHeaderRow: true });
    ctx.log.info(`Found ${sheetBirthdays.length} birthday(s) in Google Sheets`);
    
    // Step 2: Sync birthdays to calendar (treating calendar as source of truth)
    ctx.log.info('Step 2: Syncing birthdays to Google Calendar...');
    
    // Write birthdays to calendar using data source
    // The calendar source's write method handles duplicate checking internally
    // Note: write method existence is validated upfront
    const writeResult = await ctx.calendarSource.write(sheetBirthdays);
    ctx.log.info('Sync completed', { 
      synced: writeResult.added, 
      skipped: writeResult.skipped, 
      errors: writeResult.errors 
    });
    
    // Step 3: Read all birthdays from calendar
    ctx.log.info('Step 3: Reading all birthdays from Google Calendar...');
    
    ctx.log.info(`Fetching events from ${year}`);
    
    const birthdayRecords = await ctx.calendarSource.read({
      startDate: yearStart,
      endDate: yearEnd,
    });
    
    if (birthdayRecords.length === 0) {
      await ctx.outputChannel.send(`\n📅 No birthdays found for ${year}.\n`);
      ctx.log.info('Completed successfully - no birthdays found');
      return process.exit(0);
    }
    
    // Step 4: Format and display birthdays
    ctx.log.info('Step 4: Displaying all birthdays...');
    
    // Sort records by birthday date first, then group by formatted date
    const sortedRecords = [...birthdayRecords].sort((a, b) => 
      a.birthday.getTime() - b.birthday.getTime()
    );
    // Group sorted records by formatted date
    const birthdaysByDate = sortedRecords.reduce<Record<string, BirthdayRecord[]>>((acc, record) => {
      const dateKey = formatDateShort(record.birthday);
      (acc[dateKey] ??= []).push(record);
      return acc;
    }, {});
    
    // Extract sorted dates (already sorted since records were sorted)
    const sortedDates = Object.keys(birthdaysByDate);
    
    // Display results
    ctx.log.info(`Found ${birthdayRecords.length} birthday(s) in ${year}`);
    await ctx.outputChannel.send(`\n🎉 Found ${birthdayRecords.length} birthday(s) in ${year}:\n`);
    
    // Group by month for better readability
    // Use the first record's birthday date to get month name (all records in group have same date)
    const birthdaysByMonth = sortedDates.reduce<Record<string, { date: string; records: BirthdayRecord[] }[]>>((acc, date) => {
      const records = birthdaysByDate[date];
      if (records.length === 0) return acc;
      
      // Use the first record's birthday to get month name (all records have same date)
      const monthName = records[0].birthday.toLocaleString('default', { month: 'long' });
      (acc[monthName] ??= []).push({ date, records });
      return acc;
    }, {});
    
    // Display by month
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    for (const monthName of monthNames) {
      if (birthdaysByMonth[monthName]) {
        await ctx.outputChannel.send(`\n📅 ${monthName}:`);
        for (const { date, records } of birthdaysByMonth[monthName]) {
          const names = records.map(r => r.lastName ? `${r.firstName} ${r.lastName}` : r.firstName);
          await ctx.outputChannel.send(`   🎂 ${date}: ${names.join(', ')}`);
        }
      }
    }
    
    await ctx.outputChannel.send('\n✅ Completed successfully!');
    ctx.log.info('Completed successfully');
  } catch (error) {
    ctx.log.error('Error getting all birthdays', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script
getAllBirthdays();
