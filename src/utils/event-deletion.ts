import { calendar_v3 } from 'googleapis';
import { fetchEvents } from './calendar-helpers.js';
import { today, startOfYear, endOfYear, formatDateRange } from './date.js';

/**
 * Event deletion utilities
 */

export interface DeleteOptions {
  startDate?: Date;
  endDate?: Date;
  calendarId?: string;
}

export interface DeletionResult {
  deletedCount: number;
  skippedCount: number;
  errorCount: number;
}

/**
 * Get events for deletion based on options
 */
export async function getEventsForDeletion(
  calendar: calendar_v3.Calendar,
  options: DeleteOptions
): Promise<calendar_v3.Schema$Event[]> {
  const todayDate = today();
  const startDate = options.startDate ?? startOfYear(todayDate);
  const endDate = options.endDate ?? endOfYear(todayDate);
  
  console.log(`\nFetching events from ${formatDateRange(startDate, endDate)}...`);
  return fetchEvents(calendar, {
    startDate,
    endDate,
    calendarId: options.calendarId,
    maxResults: 2500,
  });
}

/**
 * Delete a single event from the calendar
 */
export async function deleteEvent(
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

/**
 * Delete all events in bulk mode
 */
export async function deleteAllEvents(
  calendar: calendar_v3.Calendar,
  events: calendar_v3.Schema$Event[],
  calendarId: string
): Promise<DeletionResult> {
  const result: DeletionResult = {
    deletedCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };

  console.log('\nDeleting events...\n');

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventNumber = i + 1;
    const totalEvents = events.length;

    if (event.id) {
      const success = await deleteEvent(calendar, event.id, calendarId);
      if (success) {
        console.log(`[${eventNumber}/${totalEvents}] ✅ Deleted: ${event.summary ?? 'Untitled Event'}`);
        result.deletedCount++;
      } else {
        console.log(`[${eventNumber}/${totalEvents}] ❌ Failed to delete: ${event.summary ?? 'Untitled Event'}`);
        result.errorCount++;
      }
    } else {
      console.log(`[${eventNumber}/${totalEvents}] ⚠️  Event has no ID, cannot delete: ${event.summary ?? 'Untitled Event'}`);
      result.errorCount++;
    }
  }

  return result;
}

/**
 * Delete events interactively (one by one with confirmation)
 */
export async function deleteEventsInteractively(
  calendar: calendar_v3.Calendar,
  events: calendar_v3.Schema$Event[],
  calendarId: string,
  askConfirmation: (question: string) => Promise<boolean>,
  formatEvent: (event: calendar_v3.Schema$Event) => string
): Promise<DeletionResult> {
  const result: DeletionResult = {
    deletedCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };

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

    const shouldDelete = await askConfirmation('Delete this event? (y/n): ');

    if (shouldDelete) {
      if (event.id) {
        const success = await deleteEvent(calendar, event.id, calendarId);
        if (success) {
          console.log('✅ Event deleted successfully');
          result.deletedCount++;
        } else {
          console.log('❌ Failed to delete event');
          result.errorCount++;
        }
      } else {
        console.log('⚠️  Event has no ID, cannot delete');
        result.errorCount++;
      }
    } else {
      console.log('⏭️  Skipped');
      result.skippedCount++;
    }
  }

  return result;
}

/**
 * Display deletion summary
 */
export function displayDeletionSummary(
  result: DeletionResult,
  totalEvents: number
): void {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY:');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total events reviewed: ${Math.min(result.deletedCount + result.skippedCount + result.errorCount, totalEvents)}`);
  console.log(`✅ Deleted: ${result.deletedCount}`);
  console.log(`⏭️  Skipped: ${result.skippedCount}`);
  console.log(`❌ Errors: ${result.errorCount}`);
  console.log('');
}

