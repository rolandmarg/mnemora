import { calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { createQuestionInterface, askConfirmation } from '../utils/cli.js';
import { createReadWriteCalendarClient } from '../utils/calendar-auth.js';
import { formatEvent } from '../utils/event-formatter.js';
import { fetchEvents } from '../utils/calendar-helpers.js';

/**
 * Script to interactively delete events from Google Calendar
 * Usage: yarn delete-events
 * Or: yarn delete-events --date-range "2024-01-01" "2024-12-31"
 * Or: yarn delete-events --all (delete all events without review)
 * Or: yarn delete-events --all --date-range "2024-01-01" "2024-12-31"
 */

interface DeleteOptions {
  startDate?: Date;
  endDate?: Date;
  calendarId?: string;
}


async function getEvents(
  calendar: calendar_v3.Calendar,
  options: DeleteOptions
): Promise<calendar_v3.Schema$Event[]> {
  const startDate = options.startDate ?? new Date(new Date().getFullYear(), 0, 1);
  const endDate = options.endDate ?? new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);
  
  console.log(`\nFetching events from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}...`);
  return fetchEvents(calendar, {
    startDate,
    endDate,
    calendarId: options.calendarId,
    maxResults: 2500,
  });
}

async function deleteEvent(
  calendar: calendar_v3.Calendar,
  eventId: string,
  calendarId: string
): Promise<boolean> {
  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    });
    return true;
  } catch (error) {
    console.error(`Error deleting event ${eventId}:`, error);
    return false;
  }
}


async function main(): Promise<void> {
  const calendar = createReadWriteCalendarClient();

  // Parse command line arguments
  const args = process.argv.slice(2);
  let startDate: Date | undefined;
  let endDate: Date | undefined;
  let calendarId: string | undefined;
  const deleteAll = args.includes('--all') || args.includes('-a');

  // Parse date range if provided
  if (args.includes('--date-range')) {
    const dateRangeIndex = args.indexOf('--date-range');
    if (dateRangeIndex !== -1 && args.length > dateRangeIndex + 2) {
      startDate = new Date(args[dateRangeIndex + 1]);
      endDate = new Date(args[dateRangeIndex + 2]);
    }
  }

  // Parse calendar ID if provided
  if (args.includes('--calendar')) {
    const calendarIndex = args.indexOf('--calendar');
    if (calendarIndex !== -1 && args.length > calendarIndex + 1) {
      calendarId = args[calendarIndex + 1];
    }
  }

  const rl = createQuestionInterface();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🗑️  Delete Events from Google Calendar');
    console.log('═══════════════════════════════════════════════════════\n');

    const targetCalendarId = calendarId ?? config.google.calendarId;
    console.log(`Calendar: ${targetCalendarId}\n`);

    // Fetch events
    const events = await getEvents(calendar, { startDate, endDate, calendarId: targetCalendarId });

    if (events.length === 0) {
      console.log('✅ No events found in the specified date range.');
      rl.close();
      process.exit(0);
    }

    console.log(`\n📅 Found ${events.length} event(s)\n`);

    let deletedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    if (deleteAll) {
      // Delete all events without review
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('⚠️  DELETE ALL MODE - Deleting all events without review');
      console.log('═══════════════════════════════════════════════════════\n');

      const confirm = await askConfirmation(rl, `⚠️  WARNING: This will delete ALL ${events.length} event(s). Continue? (y/n): `);
      if (!confirm) {
        console.log('❌ Cancelled. No events deleted.');
        rl.close();
        process.exit(0);
      }

      console.log('\nDeleting events...\n');

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const eventNumber = i + 1;
        const totalEvents = events.length;

        if (event.id) {
          const success = await deleteEvent(calendar, event.id, targetCalendarId);
          if (success) {
            console.log(`[${eventNumber}/${totalEvents}] ✅ Deleted: ${event.summary ?? 'Untitled Event'}`);
            deletedCount++;
          } else {
            console.log(`[${eventNumber}/${totalEvents}] ❌ Failed to delete: ${event.summary ?? 'Untitled Event'}`);
            errorCount++;
          }
        } else {
          console.log(`[${eventNumber}/${totalEvents}] ⚠️  Event has no ID, cannot delete: ${event.summary ?? 'Untitled Event'}`);
          errorCount++;
        }
      }
    } else {
      // Interactive mode - review each event
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('Reviewing events...');
      console.log('═══════════════════════════════════════════════════════\n');

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const eventNumber = i + 1;
        const totalEvents = events.length;

        console.log(`\n[${eventNumber}/${totalEvents}]`);
        console.log(formatEvent(event));
        console.log('');

        const shouldDelete = await askConfirmation(rl, 'Delete this event? (y/n): ');

        if (shouldDelete) {
          if (event.id) {
            const success = await deleteEvent(calendar, event.id, targetCalendarId);
            if (success) {
              console.log('✅ Event deleted successfully');
              deletedCount++;
            } else {
              console.log('❌ Failed to delete event');
              errorCount++;
            }
          } else {
            console.log('⚠️  Event has no ID, cannot delete');
            errorCount++;
          }
        } else {
          console.log('⏭️  Skipped');
          skippedCount++;
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 SUMMARY:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total events reviewed: ${Math.min(deletedCount + skippedCount + errorCount, events.length)}`);
    console.log(`✅ Deleted: ${deletedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    rl.close();
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();

