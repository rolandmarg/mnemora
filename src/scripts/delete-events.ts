import { config } from '../config.js';
import { createQuestionInterface, askConfirmation } from '../utils/cli.js';
import { createReadWriteCalendarClient } from '../utils/calendar-auth.js';
import { formatEvent } from '../utils/event-formatter.js';
import { parseDateFromString } from '../utils/date.js';
import {
  getEventsForDeletion,
  deleteAllEvents,
  deleteEventsInteractively,
  displayDeletionSummary,
} from '../utils/event-deletion.js';

/**
 * Script to interactively delete events from Google Calendar
 * Usage: yarn delete-events
 * Or: yarn delete-events --date-range "2024-01-01" "2024-12-31"
 * Or: yarn delete-events --all (delete all events without review)
 * Or: yarn delete-events --all --date-range "2024-01-01" "2024-12-31"
 */

function parseCommandLineArgs(args: string[]): {
  startDate?: Date;
  endDate?: Date;
  calendarId?: string;
  deleteAll: boolean;
} {
  const deleteAll = args.includes('--all') || args.includes('-a');
  let startDate: Date | undefined;
  let endDate: Date | undefined;
  let calendarId: string | undefined;

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

  // Parse calendar ID if provided
  if (args.includes('--calendar')) {
    const calendarIndex = args.indexOf('--calendar');
    if (calendarIndex !== -1 && args.length > calendarIndex + 1) {
      calendarId = args[calendarIndex + 1];
    }
  }

  return { startDate, endDate, calendarId, deleteAll };
}

async function handleBulkDeletion(
  calendar: ReturnType<typeof createReadWriteCalendarClient>,
  events: Awaited<ReturnType<typeof getEventsForDeletion>>,
  calendarId: string
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

  return deleteAllEvents(calendar, events, calendarId);
}

async function handleInteractiveDeletion(
  calendar: ReturnType<typeof createReadWriteCalendarClient>,
  events: Awaited<ReturnType<typeof getEventsForDeletion>>,
  calendarId: string
): Promise<{ deletedCount: number; skippedCount: number; errorCount: number }> {
  const rl = createQuestionInterface();
  const askConfirmationWrapper = async (question: string): Promise<boolean> => askConfirmation(rl, question);
  return deleteEventsInteractively(calendar, events, calendarId, askConfirmationWrapper, formatEvent);
}

async function main(): Promise<void> {
  const calendar = createReadWriteCalendarClient();
  const args = process.argv.slice(2);
  const { startDate, endDate, calendarId, deleteAll } = parseCommandLineArgs(args);

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🗑️  Delete Events from Google Calendar');
    console.log('═══════════════════════════════════════════════════════\n');

    const targetCalendarId = calendarId ?? config.google.calendarId;
    console.log(`Calendar: ${targetCalendarId}\n`);

    // Fetch events
    const events = await getEventsForDeletion(calendar, { startDate, endDate, calendarId: targetCalendarId });

    if (events.length === 0) {
      console.log('✅ No events found in the specified date range.');
      process.exit(0);
    }

    console.log(`\n📅 Found ${events.length} event(s)\n`);

    const result = deleteAll
      ? await handleBulkDeletion(calendar, events, targetCalendarId)
      : await handleInteractiveDeletion(calendar, events, targetCalendarId);

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
