import { appContext } from '../app-context.js';
import { BirthdayService } from '../services/birthday.service.js';
import { getFullName } from '../utils/name-helpers.util.js';
import { formatDateISO } from '../utils/date-helpers.util.js';

/**
 * Script to check sync status between Sheets and Calendar
 * Shows what should be synced vs what's actually in the calendar
 */
async function checkSyncStatus(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);

  try {
    appContext.logger.info('=== Sync Status Check ===');
    
    // Step 1: Read from Sheets (source of truth)
    appContext.logger.info('Step 1: Reading birthdays from Google Sheets...');
    const sheetBirthdays = await birthdayService.readFromSheets();
    appContext.logger.info(`Found ${sheetBirthdays.length} birthday(s) in Sheets`);
    
    if (sheetBirthdays.length === 0) {
      appContext.logger.warn('No birthdays found in Sheets - nothing to sync');
      process.exit(0);
    }

    // Step 2: Read from Calendar (what's actually synced)
    appContext.logger.info('Step 2: Reading birthdays from Google Calendar...');
    
    // Get all birthdays from calendar (checks current year for recurring events)
    const calendarBirthdays = await birthdayService.getAllBirthdaysForYear();
    appContext.logger.info(`Found ${calendarBirthdays.length} birthday event(s) in Calendar`);

    // Step 3: Compare and show what's missing
    appContext.logger.info('Step 3: Comparing Sheets vs Calendar...');
    
    // Create lookup maps
    const getLookupKey = (b: typeof sheetBirthdays[0]) => 
      `${formatDateISO(new Date(b.birthday))}|${b.firstName.toLowerCase()}|${(b.lastName ?? '').toLowerCase()}`;
    
    const sheetMap = new Map<string, typeof sheetBirthdays[0]>();
    sheetBirthdays.forEach(b => {
      sheetMap.set(getLookupKey(b), b);
    });
    
    const calendarMap = new Map<string, typeof calendarBirthdays[0]>();
    calendarBirthdays.forEach(b => {
      calendarMap.set(getLookupKey(b), b);
    });
    
    // Find what's in Sheets but not in Calendar
    const missingInCalendar: typeof sheetBirthdays = [];
    const inBoth: Array<{ sheet: typeof sheetBirthdays[0]; calendar: typeof calendarBirthdays[0] }> = [];
    const onlyInCalendar: typeof calendarBirthdays = [];
    
    for (const [key, sheetBirthday] of sheetMap.entries()) {
      const calendarBirthday = calendarMap.get(key);
      if (calendarBirthday) {
        inBoth.push({ sheet: sheetBirthday, calendar: calendarBirthday });
      } else {
        missingInCalendar.push(sheetBirthday);
      }
    }
    
    for (const [key, calendarBirthday] of calendarMap.entries()) {
      if (!sheetMap.has(key)) {
        onlyInCalendar.push(calendarBirthday);
      }
    }
    
    // Step 4: Display results
    appContext.logger.info('=== Sync Status Results ===');
    appContext.logger.info(`Total in Sheets: ${sheetBirthdays.length}`);
    appContext.logger.info(`Total in Calendar: ${calendarBirthdays.length}`);
    appContext.logger.info(`✅ Synced (in both): ${inBoth.length}`);
    appContext.logger.info(`❌ Missing in Calendar: ${missingInCalendar.length}`);
    appContext.logger.info(`⚠️  Only in Calendar (not in Sheets): ${onlyInCalendar.length}`);
    
    if (missingInCalendar.length > 0) {
      appContext.logger.warn('\n=== Missing in Calendar (need to sync) ===');
      missingInCalendar.forEach(b => {
        const name = getFullName(b.firstName, b.lastName);
        const date = formatDateISO(new Date(b.birthday));
        appContext.logger.warn(`  - ${name}: ${date}`);
      });
    }
    
    if (onlyInCalendar.length > 0) {
      appContext.logger.warn('\n=== Only in Calendar (not in Sheets) ===');
      onlyInCalendar.forEach(b => {
        const name = getFullName(b.firstName, b.lastName);
        const date = formatDateISO(new Date(b.birthday));
        appContext.logger.warn(`  - ${name}: ${date}`);
      });
    }
    
    if (inBoth.length > 0) {
      appContext.logger.info('\n=== Successfully Synced ===');
      inBoth.slice(0, 10).forEach(({ sheet }) => {
        const name = getFullName(sheet.firstName, sheet.lastName);
        const date = formatDateISO(new Date(sheet.birthday));
        appContext.logger.info(`  ✅ ${name}: ${date}`);
      });
      if (inBoth.length > 10) {
        appContext.logger.info(`  ... and ${inBoth.length - 10} more`);
      }
    }
    
    // Step 5: Check for potential sync issues
    appContext.logger.info('\n=== Sync Analysis ===');
    
    // Check if date range logic might be the issue
    appContext.logger.warn('⚠️  POTENTIAL BUG: Sync checks for duplicates only within birth year range.');
    appContext.logger.warn('⚠️  But calendar events are recurring and appear every year.');
    appContext.logger.warn('⚠️  If someone was born in 1990, sync only checks 1990, but event exists in 2024/2025.');
    appContext.logger.warn('⚠️  This could cause duplicates to be missed during sync.');
    
    // Check for potential duplicate detection issues
    const duplicateCounts = new Map<string, number>();
    calendarBirthdays.forEach(b => {
      const key = getLookupKey(b);
      duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
    });
    
    const duplicates = Array.from(duplicateCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([key]) => key);
    
    if (duplicates.length > 0) {
      appContext.logger.error(`\n❌ Found ${duplicates.length} duplicate(s) in Calendar!`);
      duplicates.forEach(key => {
        const [date, firstName, lastName] = key.split('|');
        appContext.logger.error(`  - Duplicate: ${firstName} ${lastName} on ${date} (${duplicateCounts.get(key)}x)`);
      });
    }
    
    appContext.logger.info('\n=== Summary ===');
    if (missingInCalendar.length === 0 && duplicates.length === 0) {
      appContext.logger.info('✅ Sync status: OK - All birthdays are synced and no duplicates found');
    } else {
      appContext.logger.warn('⚠️  Sync status: Issues detected');
      if (missingInCalendar.length > 0) {
        appContext.logger.warn(`   - ${missingInCalendar.length} birthday(s) need to be synced`);
      }
      if (duplicates.length > 0) {
        appContext.logger.warn(`   - ${duplicates.length} duplicate(s) found in calendar`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    appContext.logger.error('Error checking sync status', error);
    process.exit(1);
  }
}

checkSyncStatus();

