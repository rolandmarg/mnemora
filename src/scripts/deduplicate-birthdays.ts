/**
 * Deduplicate Birthday Events Script
 * 
 * This script identifies and removes duplicate birthday events from Google Calendar.
 * Duplicates are identified by matching date, first name, and last name.
 * 
 * Usage:
 *   yarn deduplicate-birthdays              # Dry run (shows what would be deleted)
 *   yarn deduplicate-birthdays --confirm    # Actually delete duplicates
 */

import { appContext } from '../app-context.js';
import { extractNameFromEvent, isBirthdayEvent } from '../utils/event-helpers.util.js';
import { extractNameParts } from '../utils/name-helpers.util.js';
import { parseDateFromString, formatDateISO, startOfYear, endOfYear } from '../utils/date-helpers.util.js';
import { auditDeletionAttempt } from '../utils/security.util.js';
import { google } from 'googleapis';
import { config } from '../config.js';
import type { Event } from '../types/event.types.js';

interface BirthdayEvent {
  event: Event;
  eventId: string;
  date: string; // YYYY-MM-DD
  firstName: string;
  lastName: string;
  lookupKey: string;
  created?: string; // ISO timestamp if available
}

function getLookupKey(date: string, firstName: string, lastName: string): string {
  return `${date}|${firstName.toLowerCase()}|${(lastName ?? '').toLowerCase()}`;
}

function eventToBirthdayEvent(event: Event): BirthdayEvent | null {
  if (!event.id) {
    return null;
  }

  const startDate = event.start?.date ?? event.start?.dateTime;
  if (!startDate) {
    return null;
  }

  try {
    const birthday = parseDateFromString(startDate);
    const dateString = formatDateISO(birthday);
    const fullName = extractNameFromEvent(event);
    const { firstName, lastName } = extractNameParts(fullName);

    return {
      event,
      eventId: event.id,
      date: dateString,
      firstName,
      lastName: lastName ?? '',
      lookupKey: getLookupKey(dateString, firstName, lastName ?? ''),
      // Note: Google Calendar API doesn't expose created date in standard event object
      // We'll use the order they appear as a fallback
    };
  } catch {
    return null;
  }
}

async function getAllBirthdayEvents(): Promise<BirthdayEvent[]> {
  // Fetch events directly from Google Calendar API to get all recurring events
  // The calendarClient.fetchEvents filters by exact date match, which doesn't work for wide ranges
  const clientEmail = config.google.clientEmail;
  const privateKey = config.google.privateKey;
  const calendarId = config.google.calendarId;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  // Fetch events for a wide range to catch all recurring birthday events
  const today = new Date();
  const startYear = today.getFullYear() - 2; // 2 years ago
  const endYear = today.getFullYear() + 2;   // 2 years ahead
  const yearStart = startOfYear(new Date(startYear, 0, 1));
  const yearEnd = endOfYear(new Date(endYear, 0, 1));

  appContext.logger.info('Fetching all birthday events from calendar', {
    startYear,
    endYear,
    startDate: yearStart.toISOString().split('T')[0],
    endDate: yearEnd.toISOString().split('T')[0],
  });

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // Fetch events with singleEvents=true to expand recurring events
  const timeMinUTC = new Date(Date.UTC(
    yearStart.getFullYear(),
    yearStart.getMonth(),
    yearStart.getDate(),
    0, 0, 0, 0
  ));
  const timeMaxUTC = new Date(Date.UTC(
    yearEnd.getFullYear(),
    yearEnd.getMonth(),
    yearEnd.getDate() + 1,
    0, 0, 0, 0
  ));

  const response = await calendar.events.list({
    calendarId: calendarId || 'primary',
    timeMin: timeMinUTC.toISOString(),
    timeMax: timeMaxUTC.toISOString(),
    singleEvents: true, // Expand recurring events
    orderBy: 'startTime',
    maxResults: 2500, // Google Calendar API limit
  });

  const calendarEvents = response.data.items ?? [];
  appContext.logger.info(`Fetched ${calendarEvents.length} total event(s) from calendar API`);

  // Convert to our Event type and filter for birthday events
  const events: Event[] = calendarEvents.map(calEvent => ({
    id: calEvent.id ?? undefined,
    summary: calEvent.summary ?? undefined,
    description: calEvent.description ?? undefined,
    location: calEvent.location ?? undefined,
    start: calEvent.start ? {
      date: calEvent.start.date ?? undefined,
      dateTime: calEvent.start.dateTime ?? undefined,
      timeZone: calEvent.start.timeZone ?? undefined,
    } : undefined,
    end: calEvent.end ? {
      date: calEvent.end.date ?? undefined,
      dateTime: calEvent.end.dateTime ?? undefined,
      timeZone: calEvent.end.timeZone ?? undefined,
    } : undefined,
    recurrence: calEvent.recurrence ?? undefined,
    recurringEventId: calEvent.recurringEventId ?? undefined,
  }));

  // Debug: log some event details to understand what we're getting
  if (events.length > 0) {
    appContext.logger.info('Sample events (first 3):', {
      samples: events.slice(0, 3).map(e => ({
        summary: e.summary,
        isBirthday: isBirthdayEvent(e),
        hasRecurrence: !!e.recurrence,
        start: e.start?.date || e.start?.dateTime,
      })),
    });
  }

  const birthdayEvents = events
    .filter(isBirthdayEvent)
    .map(eventToBirthdayEvent)
    .filter((event): event is BirthdayEvent => event !== null);

  appContext.logger.info(`Found ${birthdayEvents.length} birthday event(s)`, {
    totalEvents: events.length,
    birthdayEvents: birthdayEvents.length,
    filteredOut: events.length - birthdayEvents.length,
  });

  return birthdayEvents;
}

function findDuplicates(birthdayEvents: BirthdayEvent[]): Map<string, BirthdayEvent[]> {
  const grouped = new Map<string, BirthdayEvent[]>();

  for (const birthdayEvent of birthdayEvents) {
    const existing = grouped.get(birthdayEvent.lookupKey) ?? [];
    existing.push(birthdayEvent);
    grouped.set(birthdayEvent.lookupKey, existing);
  }

  // Filter to only groups with duplicates
  const duplicates = new Map<string, BirthdayEvent[]>();
  for (const [key, events] of grouped.entries()) {
    if (events.length > 1) {
      duplicates.set(key, events);
    }
  }

  return duplicates;
}

async function deleteEvent(eventId: string): Promise<void> {
  auditDeletionAttempt(appContext, 'deduplicate-birthdays.ts', { eventId });

  const clientEmail = config.google.clientEmail;
  const privateKey = config.google.privateKey;
  const calendarId = config.google.calendarId;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({
    calendarId: calendarId || 'primary',
    eventId,
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--confirm');

  if (isDryRun) {
    console.log('\n🔍 DRY RUN MODE - No events will be deleted\n');
    console.log('To actually delete duplicates, run: yarn deduplicate-birthdays --confirm\n');
  } else {
    console.log('\n⚠️  CONFIRMATION MODE - Duplicates will be PERMANENTLY DELETED\n');
    console.log('This will delete duplicate birthday events from Google Calendar.');
    console.log('Only one event per person/date will be kept.\n');
  }

  try {
    const allBirthdayEvents = await getAllBirthdayEvents();

    if (allBirthdayEvents.length === 0) {
      console.log('✅ No birthday events found in calendar.');
      process.exit(0);
    }

    const duplicates = findDuplicates(allBirthdayEvents);

    if (duplicates.size === 0) {
      console.log('✅ No duplicate birthday events found. All events are unique.');
      process.exit(0);
    }

    console.log(`\n📊 Found ${duplicates.size} group(s) with duplicate birthday events:\n`);

    const eventsToDelete: BirthdayEvent[] = [];

    for (const [lookupKey, events] of duplicates.entries()) {
      const [date, firstName, lastName] = lookupKey.split('|');
      const name = lastName ? `${firstName} ${lastName}` : firstName;
      const duplicateCount = events.length - 1; // Keep one, delete the rest

      console.log(`  ${name} (${date}):`);
      console.log(`    Found ${events.length} duplicate(s) - will keep 1, delete ${duplicateCount}`);

      // Keep the first one encountered (events are typically returned in chronological order)
      // If we had created timestamps, we'd keep the oldest one
      const toKeep = events[0];
      const toDelete = events.slice(1);

      console.log(`    Keeping: ${toKeep.event.summary} (ID: ${toKeep.eventId})`);
      for (const event of toDelete) {
        console.log(`    Deleting: ${event.event.summary} (ID: ${event.eventId})`);
        eventsToDelete.push(event);
      }
      console.log();
    }

    console.log(`\n📈 Summary:`);
    console.log(`   Total birthday events: ${allBirthdayEvents.length}`);
    console.log(`   Duplicate groups: ${duplicates.size}`);
    console.log(`   Events to delete: ${eventsToDelete.length}`);
    console.log(`   Events to keep: ${allBirthdayEvents.length - eventsToDelete.length}\n`);

    if (isDryRun) {
      console.log('🔍 This was a dry run. No events were deleted.');
      console.log('   Run with --confirm to actually delete duplicates.\n');
      process.exit(0);
    }

    // Confirm deletion
    console.log('⚠️  About to delete the duplicate events listed above.');
    console.log('   This action cannot be undone.\n');

    // Delete events
    let deleted = 0;
    let errors = 0;

    for (const event of eventsToDelete) {
      try {
        await deleteEvent(event.eventId);
        deleted++;
        appContext.logger.info('Deleted duplicate birthday event', {
          eventId: event.eventId,
          summary: event.event.summary,
          date: event.date,
        });
      } catch (error) {
        errors++;
        appContext.logger.error('Failed to delete duplicate birthday event', error, {
          eventId: event.eventId,
          summary: event.event.summary,
          date: event.date,
        });
        console.error(`   ❌ Failed to delete: ${event.event.summary} (${event.eventId})`);
      }
    }

    console.log(`\n✅ Deduplication complete:`);
    console.log(`   Deleted: ${deleted}`);
    console.log(`   Errors: ${errors}\n`);

    if (errors > 0) {
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    appContext.logger.error('Error during deduplication', error);
    console.error('\n❌ Error during deduplication:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

