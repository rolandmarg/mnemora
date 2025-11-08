import { config } from '../config.js';
import { createQuestionInterface, askConfirmation } from '../utils/cli-helpers.js';
import birthdayService from '../services/birthday.js';
import { displayDeletionSummary } from '../utils/event-helpers.js';
import { parseDateFromString, today, startOfYear, endOfYear, formatDateRange } from '../utils/date-helpers.js';
import { logger } from '../utils/logger.js';
import type { BirthdayRecord } from '../utils/birthday-helpers.js';

/**
 * Script to delete events from Google Calendar
 * Usage: yarn delete-events --all (delete all events with confirmation)
 * Or: yarn delete-events --all --date-range "2024-01-01" "2024-12-31"
 */

function parseCommandLineArgs(args: string[]): {
  startDate?: Date;
  endDate?: Date;
  deleteAll: boolean;
} {
  const deleteAll = args.includes('--all') || args.includes('-a');
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  // Parse date range if provided
  if (args.includes('--date-range')) {
    const dateRangeIndex = args.indexOf('--date-range');
    if (dateRangeIndex !== -1 && args.length > dateRangeIndex + 2) {
      try {
        startDate = parseDateFromString(args[dateRangeIndex + 1]);
        endDate = parseDateFromString(args[dateRangeIndex + 2]);
      } catch (error) {
        logger.error('Error parsing date range', error);
        process.exit(1);
      }
    }
  }

  return { startDate, endDate, deleteAll };
}

async function handleBulkDeletion(
  birthdays: BirthdayRecord[],
  startDate: Date,
  endDate: Date
): Promise<{ deletedCount: number; skippedCount: number; errorCount: number }> {
  logger.warn('DELETE ALL MODE - Deleting all events without review', { count: birthdays.length });

  const rl = createQuestionInterface();
  try {
    const confirm = await askConfirmation(rl, `⚠️  WARNING: This will delete ALL ${birthdays.length} birthday event(s). Continue? (y/n): `);
    if (!confirm) {
      logger.info('Cancelled. No events deleted.');
      rl.close();
      process.exit(0);
    }
    rl.close();
  } catch {
    rl.close();
    process.exit(1);
  }

  return birthdayService.deleteAllBirthdays(startDate, endDate);
}


async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { startDate, endDate, deleteAll } = parseCommandLineArgs(args);

  try {
    logger.info('Delete Events from Google Calendar');

    const targetCalendarId = config.google.calendarId;
    if (!targetCalendarId) {
      logger.error('Calendar ID not configured. Please set GOOGLE_CALENDAR_ID in .env');
      process.exit(1);
    }
    logger.info(`Calendar: ${targetCalendarId}`);

    // Fetch events
    const todayDate = today();
    const finalStartDate = startDate ?? startOfYear(todayDate);
    const finalEndDate = endDate ?? endOfYear(todayDate);
    
    logger.info(`Fetching birthdays from ${formatDateRange(finalStartDate, finalEndDate)}`);
    
    // Get birthdays
    const birthdays = await birthdayService.getBirthdays(finalStartDate, finalEndDate);

    // Validate that we found birthdays
    if (birthdays.length === 0) {
      logger.info('No birthdays found in the specified date range.');
      process.exit(0);
    }

    logger.info(`Found ${birthdays.length} event(s) to delete`);

    if (!deleteAll) {
      logger.error('Interactive deletion is not supported. Use --all flag to delete all events.');
      process.exit(1);
    }

    const result = await handleBulkDeletion(birthdays, finalStartDate, finalEndDate);

    displayDeletionSummary(result, birthdays.length);
    process.exit(0);
  } catch (error) {
    logger.error('Error in delete-events script', error);
    process.exit(1);
  }
}

main();
