import { config } from '../config.js';
import { createQuestionInterface, askConfirmation } from '../utils/cli-helpers.js';
import calendarClient from '../clients/google-calendar.client.js';
import { displayDeletionSummary } from '../utils/event-helpers.js';
import { parseDateFromString, today, startOfYear, endOfYear, formatDateRange } from '../utils/date.js';

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
        console.error('❌ Error parsing date range:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  }

  return { startDate, endDate, deleteAll };
}

async function handleBulkDeletion(
  events: Awaited<ReturnType<typeof calendarClient.fetchEvents>>
): Promise<{ deletedCount: number; skippedCount: number; errorCount: number }> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('⚠️  DELETE ALL MODE - Deleting all events without review');
  console.log('═══════════════════════════════════════════════════════\n');

  const rl = createQuestionInterface();
  try {
    const confirm = await askConfirmation(rl, `⚠️  WARNING: This will delete ALL ${events.length} event(s). Continue? (y/n): `);
    if (!confirm) {
      console.log('❌ Cancelled. No events deleted.');
      rl.close();
      process.exit(0);
    }
    rl.close();
  } catch {
    rl.close();
    process.exit(1);
  }

  return calendarClient.deleteAllEvents(events);
}


async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { startDate, endDate, deleteAll } = parseCommandLineArgs(args);

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🗑️  Delete Events from Google Calendar');
    console.log('═══════════════════════════════════════════════════════\n');

    const targetCalendarId = config.google.calendarId;
    if (!targetCalendarId) {
      console.error('❌ Calendar ID not configured. Please set GOOGLE_CALENDAR_ID in .env');
      process.exit(1);
    }
    console.log(`Calendar: ${targetCalendarId}\n`);

    // Fetch events
    const todayDate = today();
    const finalStartDate = startDate ?? startOfYear(todayDate);
    const finalEndDate = endDate ?? endOfYear(todayDate);
    
    console.log(`\nFetching events from ${formatDateRange(finalStartDate, finalEndDate)}...`);
    const events = await calendarClient.fetchEvents({
      startDate: finalStartDate,
      endDate: finalEndDate,
      maxResults: 2500,
    });

    if (events.length === 0) {
      console.log('✅ No events found in the specified date range.');
      process.exit(0);
    }

    console.log(`\n📅 Found ${events.length} event(s)\n`);

    if (!deleteAll) {
      console.error('❌ Interactive deletion is not supported. Use --all flag to delete all events.');
      process.exit(1);
    }

    const result = await handleBulkDeletion(events);

    displayDeletionSummary(result, events.length);
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
