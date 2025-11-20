/**
 * Delete All Events Script
 * 
 * ⚠️ DESTRUCTIVE OPERATION - This will delete ALL events from Google Calendar
 * 
 * This script bypasses the security restrictions to allow bulk deletion.
 * Use with extreme caution!
 * 
 * Usage:
 *   yarn delete-all-events              # Dry run (shows what would be deleted)
 *   yarn delete-all-events --confirm    # Actually delete all events
 */

import { appContext } from '../app-context.js';
import { auditDeletionAttempt } from '../utils/security.util.js';
import { isBirthdayEvent } from '../utils/event-helpers.util.js';
import { google } from 'googleapis';
import { config } from '../config.js';
import { startOfYear, endOfYear } from '../utils/date-helpers.util.js';

async function getAllEvents(): Promise<Array<{ id: string; summary: string; start?: string }>> {
  const clientEmail = config.google.clientEmail;
  const privateKey = config.google.privateKey;
  const calendarId = config.google.calendarId;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  // Fetch events for a wide range to catch all events
  const today = new Date();
  const startYear = today.getFullYear() - 5; // 5 years ago
  const endYear = today.getFullYear() + 5;   // 5 years ahead
  const yearStart = startOfYear(new Date(startYear, 0, 1));
  const yearEnd = endOfYear(new Date(endYear, 0, 1));

  appContext.logger.info('Fetching all events from calendar', {
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

  // Fetch all events (Google Calendar API limit is 2500 per request)
  // We'll need to handle pagination if there are more
  let allEvents: Array<{ id: string; summary: string; start?: string }> = [];
  let pageToken: string | undefined = undefined;

  while (true) {
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response = await calendar.events.list({
      calendarId: calendarId || 'primary',
      timeMin: timeMinUTC.toISOString(),
      timeMax: timeMaxUTC.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    }) as { data: { items?: Array<{ id?: string | null; summary?: string | null; start?: { date?: string | null; dateTime?: string | null } | null }> | null; nextPageToken?: string | null } };

    const items = response.data.items ?? [];
    const events: Array<{ id: string; summary: string; start?: string }> = items.map((event) => ({
      id: event.id ?? '',
      summary: event.summary ?? 'Untitled Event',
      start: event.start?.date || event.start?.dateTime || undefined,
    }));

    allEvents = allEvents.concat(events);
    pageToken = response.data.nextPageToken ?? undefined;

    appContext.logger.info(`Fetched ${events.length} events (total so far: ${allEvents.length})`);
    
    if (!pageToken) {
      break;
    }
  }

  appContext.logger.info(`Total events found: ${allEvents.length}`);

  return allEvents;
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code === 403 || error.code === 429;
  }
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as any).response;
    if (response?.data?.error) {
      const err = response.data.error;
      return err.code === 403 || err.code === 429 || 
             err.errors?.some((e: any) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded');
    }
  }
  return false;
}

/**
 * Delete an event with exponential backoff retry logic
 */
async function deleteEvent(eventId: string, summary: string, maxRetries = 5): Promise<boolean> {
  auditDeletionAttempt(appContext, 'delete-all-events.ts', { eventId });

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

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    try {
      await calendar.events.delete({
        calendarId: calendarId || 'primary',
        eventId,
      });
      return true;
    } catch (error) {
      lastError = error;

      // If it's a rate limit error, wait and retry
      if (isRateLimitError(error) && attempt < maxRetries - 1) {
        attempt++;
        // Exponential backoff: 2^attempt seconds, with a max of 64 seconds
        const waitTime = Math.min(Math.pow(2, attempt) * 1000, 64000);
        appContext.logger.warn(`Rate limit hit for event ${eventId} (${summary}). Retrying in ${waitTime / 1000}s (attempt ${attempt}/${maxRetries})`);
        await sleep(waitTime);
        continue;
      }

      // For non-rate-limit errors or if we've exhausted retries, throw
      throw error;
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--confirm');

  console.log('\n' + '='.repeat(70));
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No events will be deleted');
  } else {
    console.log('⚠️  DESTRUCTIVE MODE - ALL EVENTS WILL BE PERMANENTLY DELETED');
  }
  console.log('='.repeat(70) + '\n');

  if (!isDryRun) {
    console.log('⚠️  WARNING: This will delete ALL events from your Google Calendar!');
    console.log('⚠️  This action CANNOT be undone!\n');
    console.log('⚠️  Make sure you have a backup if needed.\n');
  } else {
    console.log('This is a dry run. No events will be deleted.');
    console.log('To actually delete all events, run: yarn delete-all-events --confirm\n');
  }

  try {
    const allEvents = await getAllEvents();

    if (allEvents.length === 0) {
      console.log('✅ No events found in calendar.');
      process.exit(0);
    }

    // Separate birthday events from other events
    const birthdayEvents: typeof allEvents = [];
    const otherEvents: typeof allEvents = [];

    // We need to check if events are birthday events
    // For now, we'll use a simple heuristic based on summary
    for (const event of allEvents) {
      // Create a minimal event object for isBirthdayEvent check
      const eventObj = {
        summary: event.summary,
        description: undefined,
        recurrence: undefined,
        start: event.start ? { date: event.start.includes('T') ? undefined : event.start } : undefined,
      };
      
      if (isBirthdayEvent(eventObj as any)) {
        birthdayEvents.push(event);
      } else {
        otherEvents.push(event);
      }
    }

    console.log(`\n📊 Found ${allEvents.length} total event(s):`);
    console.log(`   - Birthday events: ${birthdayEvents.length}`);
    console.log(`   - Other events: ${otherEvents.length}\n`);

    if (isDryRun) {
      console.log('🔍 DRY RUN - Would delete the following events:\n');
      
      if (birthdayEvents.length > 0) {
        console.log(`Birthday Events (${birthdayEvents.length}):`);
        birthdayEvents.slice(0, 10).forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.summary} (${event.start || 'no date'})`);
        });
        if (birthdayEvents.length > 10) {
          console.log(`  ... and ${birthdayEvents.length - 10} more birthday events`);
        }
        console.log();
      }

      if (otherEvents.length > 0) {
        console.log(`Other Events (${otherEvents.length}):`);
        otherEvents.slice(0, 10).forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.summary} (${event.start || 'no date'})`);
        });
        if (otherEvents.length > 10) {
          console.log(`  ... and ${otherEvents.length - 10} more events`);
        }
        console.log();
      }

      console.log('🔍 This was a dry run. No events were deleted.');
      console.log('   Run with --confirm to actually delete all events.\n');
      process.exit(0);
    }

    // Actually delete events
    console.log('⚠️  Starting deletion of ALL events...\n');
    console.log('   Using parallel deletion with rate limiting (3 concurrent requests)...\n');

    let deleted = 0;
    const failedEvents: Array<{ id: string; summary: string; start?: string }> = [];
    const totalEvents = allEvents.length;
    const CONCURRENT_DELETES = 3; // Reduced from 10 to 3 to avoid rate limits
    const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second delay between batches
    const BATCH_SIZE = 100; // Process in batches to avoid memory issues

    // Process events in batches with parallel deletion
    for (let batchStart = 0; batchStart < allEvents.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, allEvents.length);
      const batch = allEvents.slice(batchStart, batchEnd);
      
      // Process batch with concurrent deletions
      for (let i = 0; i < batch.length; i += CONCURRENT_DELETES) {
        const concurrentBatch = batch.slice(i, i + CONCURRENT_DELETES);
        
        // Delete up to CONCURRENT_DELETES events in parallel
        const deletePromises = concurrentBatch.map(async (event) => {
          try {
            const success = await deleteEvent(event.id, event.summary);
            if (success) {
              appContext.logger.info('Deleted event', {
                eventId: event.id,
                summary: event.summary,
              });
              return { success: true, eventId: event.id, event };
            }
            return { success: false, eventId: event.id, event };
          } catch (error) {
            appContext.logger.error('Failed to delete event', error, {
              eventId: event.id,
              summary: event.summary,
            });
            return { success: false, eventId: event.id, event };
          }
        });
        
        // Wait for this batch of concurrent deletions to complete
        const results = await Promise.allSettled(deletePromises);
        
        // Count successes and track failures
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              deleted++;
            } else {
              failedEvents.push(result.value.event);
            }
          } else {
            // If the promise itself was rejected, we can't identify the event
            // This shouldn't happen but we'll skip it
          }
        });
        
        // Progress indicator
        const processed = batchStart + Math.min(i + CONCURRENT_DELETES, batch.length);
        const percent = Math.round((processed / totalEvents) * 100);
        process.stdout.write(`\r   Progress: ${processed}/${totalEvents} (${percent}%) - Deleted: ${deleted}, Failed: ${failedEvents.length}`);
        
        // Delay between batches to avoid hitting rate limits
        if (i + CONCURRENT_DELETES < batch.length || batchEnd < allEvents.length) {
          await sleep(DELAY_BETWEEN_BATCHES_MS);
        }
      }
    }

    // Retry failed deletions with exponential backoff
    if (failedEvents.length > 0) {
      console.log(`\n\n⚠️  Retrying ${failedEvents.length} failed deletions with exponential backoff...\n`);
      
      const retryFailed: Array<{ id: string; summary: string; start?: string }> = [];
      const initialDeleted = deleted;
      
      for (const event of failedEvents) {
        try {
          const success = await deleteEvent(event.id, event.summary, 10); // More retries for failed events
          if (success) {
            deleted++;
            appContext.logger.info('Successfully deleted event on retry', {
              eventId: event.id,
              summary: event.summary,
            });
          } else {
            retryFailed.push(event);
          }
        } catch (error) {
          retryFailed.push(event);
          appContext.logger.error('Failed to delete event after retries', error, {
            eventId: event.id,
            summary: event.summary,
          });
        }
        
        // Progress indicator for retries
        const retryDeleted = deleted - initialDeleted;
        const remaining = failedEvents.length - retryDeleted;
        process.stdout.write(`\r   Retry progress: ${remaining} remaining, ${retryDeleted} succeeded...`);
        
        // Longer delay between retry attempts
        await sleep(2000);
      }
      
      failedEvents.length = 0;
      failedEvents.push(...retryFailed);
      console.log('\n');
    }

    const errors = failedEvents.length;
    console.log(`\n✅ Deletion complete:`);
    console.log(`   Total events: ${totalEvents}`);
    console.log(`   Deleted: ${deleted}`);
    console.log(`   Errors: ${errors}\n`);

    if (errors > 0) {
      console.log('⚠️  Some events could not be deleted. Check logs for details.\n');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    appContext.logger.error('Error during deletion', error);
    console.error('\n❌ Error during deletion:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

