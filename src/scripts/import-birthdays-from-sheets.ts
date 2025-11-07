import { config } from '../config.js';
import sheetsService from '../services/sheets.js';
import birthdayService from '../services/birthday.js';
import { createReadWriteCalendarClient } from '../utils/event/calendar-auth.js';
import { getFullName } from '../utils/name/name-helpers.js';
import { fromDate } from '../utils/date.js';

/**
 * Script to import birthdays from Google Sheets spreadsheet
 * 
 * Usage: yarn import-birthdays-from-sheets
 * 
 * Reads from the entire first sheet.
 * Spreadsheet ID is read from GOOGLE_SPREADSHEET_ID environment variable.
 * 
 * Expected spreadsheet format:
 * - Column A: Name (e.g., "John Doe" or "John")
 * - Column B: Birthday (e.g., "1990-05-15", "05-15", "May 15, 1990", or "May 15")
 * - Optional Column C: Year (if not included in birthday column)
 * 
 * First row is assumed to be headers and will be skipped.
 */

interface ImportResult {
  total: number;
  added: number;
  skipped: number;
  errors: number;
  duplicates: number;
}


/**
 * Import birthdays from spreadsheet to calendar
 */
async function importBirthdays(): Promise<ImportResult> {
  const result: ImportResult = {
    total: 0,
    added: 0,
    skipped: 0,
    errors: 0,
    duplicates: 0,
  };

  if (!config.google.spreadsheetId) {
    throw new Error('Spreadsheet ID not configured. Please set GOOGLE_SPREADSHEET_ID in .env');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 Importing Birthdays from Google Sheets');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Spreadsheet ID: ${config.google.spreadsheetId}`);
  console.log('Reading from entire first sheet...\n');

  try {
    // Read birthdays from spreadsheet (spreadsheetId is read from config in initialize)
    console.log('Reading birthdays from spreadsheet...');
    const birthdays = await sheetsService.readBirthdays();
    result.total = birthdays.length;

    if (birthdays.length === 0) {
      console.log('No birthdays found to import.');
      return result;
    }

    console.log(`Found ${birthdays.length} birthday(s) to process.\n`);

    // Check for duplicates and add new ones
    const calendar = createReadWriteCalendarClient();

    for (let i = 0; i < birthdays.length; i++) {
      const birthday = birthdays[i];
      const fullName = getFullName(birthday.firstName, birthday.lastName);
      const birthdayDate = fromDate(birthday.birthday);

      console.log(`[${i + 1}/${birthdays.length}] Processing: ${fullName} - ${birthdayDate.toLocaleDateString()}`);

      try {
        // Check for duplicates
        const duplicates = await birthdayService.checkForDuplicates(calendar, birthday);

        if (duplicates.length > 0) {
          console.log(`   ⚠️  Duplicate found, skipping...`);
          result.duplicates++;
          continue;
        }

        // Add birthday to calendar
        await birthdayService.addBirthday(birthday, true); // Skip duplicate check since we already checked
        console.log(`   ✅ Added successfully`);
        result.added++;
      } catch (error) {
        if (error instanceof Error && error.message === 'Duplicate birthday found') {
          console.log(`   ⚠️  Duplicate found, skipping...`);
          result.duplicates++;
        } else {
          console.error(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.errors++;
        }
      }
    }

    return result;
  } catch (error) {
    console.error('\n❌ Error importing birthdays:', error);
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Display import summary
 */
function displaySummary(result: ImportResult): void {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 IMPORT SUMMARY:');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total processed: ${result.total}`);
  console.log(`✅ Added: ${result.added}`);
  console.log(`⚠️  Duplicates skipped: ${result.duplicates}`);
  console.log(`❌ Errors: ${result.errors}`);
  console.log(`⏭️  Skipped: ${result.skipped}`);
  console.log('');
}

async function main(): Promise<void> {
  try {
    const result = await importBirthdays();
    displaySummary(result);
    
    if (result.errors > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();

