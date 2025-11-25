/**
 * Delete All Events Script
 * 
 * ⚠️ DESTRUCTIVE OPERATION - This will delete ALL events from Google Calendar
 * 
 * This script bypasses the security restrictions to allow bulk deletion.
 * Use with extreme caution!
 * 
 * Usage:
 *   yarn delete-all-events                    # Dry run (shows what would be deleted)
 *   yarn delete-all-events --confirm          # Actually delete all events
 */

import { logger } from '../utils/logger.util.js';
import { auditDeletionAttempt } from '../utils/security.util.js';
import { calendar } from '@googleapis/calendar';
import { JWT } from 'google-auth-library';
import { config } from '../config.js';

interface EventWithRecurrence {
  id: string;
  summary: string;
  start?: string;
  recurrence?: string[] | null;
  recurringEventId?: string | null;
}

/**
 * Fetches all events from Google Calendar (master recurring events + standalone events).
 * Uses singleEvents: false to get master recurring events directly (not expanded instances).
 * Uses a wide date range (1900-2100) since Google Calendar API requires timeMin/timeMax.
 */
async function getAllEvents(): Promise<EventWithRecurrence[]> {
  const clientEmail = config.google.clientEmail;
  const privateKey = config.google.privateKey;
  const calendarId = config.google.calendarId;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  // Use date range 2025-2100 (we don't care about the past)
  // Google Calendar API requires timeMin and timeMax, but with singleEvents: false,
  // we get master recurring events directly regardless of when instances occur
  const yearStart = new Date('2025-01-01T00:00:00Z');
  const yearEnd = new Date('2100-12-31T23:59:59Z');

  logger.info('Fetching all events from calendar (master recurring + standalone)', {
    startDate: yearStart.toISOString().split('T')[0],
    endDate: yearEnd.toISOString().split('T')[0],
    singleEvents: false,
  });

  const auth = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  const calendarClient = calendar({ version: 'v3' as const, auth: auth as any });

  // Fetch all events (Google Calendar API limit is 2500 per request)
  // Using singleEvents: false to get master recurring events directly (not expanded instances)
  let allEvents: EventWithRecurrence[] = [];
  let pageToken: string | undefined = undefined;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response = await calendarClient.events.list({
      calendarId: calendarId || 'primary',
      timeMin: yearStart.toISOString(),
      timeMax: yearEnd.toISOString(),
      singleEvents: false, // Get master recurring events directly, not expanded instances
      maxResults: 2500,
      pageToken,
    }) as { 
      data: { 
        items?: Array<{ 
          id?: string | null; 
          summary?: string | null; 
          start?: { date?: string | null; dateTime?: string | null } | null;
          recurrence?: string[] | null;
          recurringEventId?: string | null;
        }> | null; 
        nextPageToken?: string | null;
      } 
    };

    const items = response.data.items ?? [];
    const events: EventWithRecurrence[] = items.map((event) => ({
      id: event.id ?? '',
      summary: event.summary ?? 'Untitled Event',
      start: event.start?.date ?? event.start?.dateTime ?? undefined,
      recurrence: event.recurrence ?? undefined,
      recurringEventId: event.recurringEventId ?? undefined,
    }));

    allEvents = allEvents.concat(events);
    pageToken = response.data.nextPageToken ?? undefined;

    logger.info(`Fetched ${events.length} events (total so far: ${allEvents.length})`);
    
    if (!pageToken) {
      break;
    }
  }

  logger.info(`Total events found: ${allEvents.length} (masters + standalone)`);

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
    interface ErrorResponse {
      response?: {
        data?: {
          error?: {
            code?: number;
            errors?: Array<{ reason?: string }>;
          };
        };
      };
    }
    const response = (error as ErrorResponse).response;
    if (response?.data?.error) {
      const err = response.data.error;
      return err.code === 403 || err.code === 429 || 
             (err.errors?.some((e) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded') ?? false);
    }
  }
  return false;
}

/**
 * Check if error indicates resource is already deleted (410 Gone)
 */
function isAlreadyDeletedError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code === 410;
  }
  if (error && typeof error === 'object' && 'response' in error) {
    interface ErrorResponse {
      response?: {
        data?: {
          error?: {
            code?: number;
            message?: string;
          };
        };
      };
    }
    const response = (error as ErrorResponse).response;
    if (response?.data?.error) {
      const err = response.data.error;
      return err.code === 410 || err.message === 'Resource has been deleted';
    }
  }
  return false;
}

/**
 * Delete an event with exponential backoff retry logic
 * Returns true if deleted successfully or already deleted (410), false otherwise
 */
async function deleteEvent(eventId: string, summary: string, maxRetries = 5): Promise<boolean> {
  auditDeletionAttempt(logger, 'delete-all-events.ts', { eventId });

  const clientEmail = config.google.clientEmail;
  const privateKey = config.google.privateKey;
  const calendarId = config.google.calendarId;

  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured');
  }

  const auth = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendarClient = calendar({ version: 'v3' as const, auth: auth as any });

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    try {
      await calendarClient.events.delete({
        calendarId: calendarId || 'primary',
        eventId,
      });
      return true;
    } catch (error) {
      lastError = error;

      // If resource is already deleted, treat as success
      if (isAlreadyDeletedError(error)) {
        logger.info('Event already deleted (410)', { eventId, summary });
        return true;
      }

      // If it's a rate limit error, wait and retry
      if (isRateLimitError(error) && attempt < maxRetries - 1) {
        attempt++;
        // Exponential backoff: 2^attempt seconds, with a max of 64 seconds
        const waitTime = Math.min(Math.pow(2, attempt) * 1000, 64000);
        logger.warn(`Rate limit hit for event ${eventId} (${summary}). Retrying in ${waitTime / 1000}s (attempt ${attempt}/${maxRetries})`);
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

  console.log(`\n${'='.repeat(70)}`);
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No events will be deleted');
  } else {
    console.log('⚠️  DESTRUCTIVE MODE - ALL EVENTS WILL BE PERMANENTLY DELETED');
  }
  console.log(`${'='.repeat(70)}\n`);

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

    const masters = allEvents.filter(e => e.recurrence && e.recurrence.length > 0);
    const standalone = allEvents.filter(e => !e.recurrence || e.recurrence.length === 0);

    console.log(`\n📊 Found ${allEvents.length} total event(s) (master recurring + standalone):`);
    console.log(`   - Master recurring events: ${masters.length}`);
    console.log(`   - Standalone events: ${standalone.length}`);
    console.log();
    if (masters.length > 0) {
      console.log(`ℹ️  Note: Deleting ${masters.length} master recurring event(s) will cascade delete all past and future instances.`);
      console.log();
    }

    if (isDryRun) {
      console.log('🔍 DRY RUN - Would delete the following events:\n');
      
      if (masters.length > 0) {
        console.log(`Master Recurring Events (${masters.length}):`);
        masters.slice(0, 20).forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.summary} (${event.start ?? 'no date'}) [recurring - all instances will be cascade deleted]`);
        });
        if (masters.length > 20) {
          console.log(`  ... and ${masters.length - 20} more master events`);
        }
        console.log();
      }
      
      if (standalone.length > 0) {
        console.log(`Standalone Events (${standalone.length}):`);
        standalone.slice(0, 20).forEach((event, i) => {
          console.log(`  ${i + 1}. ${event.summary} (${event.start ?? 'no date'})`);
        });
        if (standalone.length > 20) {
          console.log(`  ... and ${standalone.length - 20} more standalone events`);
        }
        console.log();
      }

      console.log('🔍 This was a dry run. No events were deleted.');
      console.log('   Run with --confirm to actually delete all events.\n');
      process.exit(0);
    }

    // Actually delete all events
    const allEventsToDelete = allEvents.map(e => ({ id: e.id, summary: e.summary }));
    
    console.log('⚠️  Starting deletion of ALL events...\n');
    console.log(`   Will delete ${allEventsToDelete.length} master/standalone events (cascade deletion will handle all instances).`);
    console.log('   Using parallel deletion with rate limiting (3 concurrent requests)...\n');

    let deleted = 0;
    const failedEvents: Array<{ id: string; summary: string }> = [];
    const totalEvents = allEventsToDelete.length;
    const CONCURRENT_DELETES = 3; // Reduced from 10 to 3 to avoid rate limits
    const DELAY_BETWEEN_BATCHES_MS = 1000; // 1 second delay between batches
    const BATCH_SIZE = 100; // Process in batches to avoid memory issues

    // Process events in batches with parallel deletion
    for (let batchStart = 0; batchStart < allEventsToDelete.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, allEventsToDelete.length);
      const batch = allEventsToDelete.slice(batchStart, batchEnd);
      
      // Process batch with concurrent deletions
      for (let i = 0; i < batch.length; i += CONCURRENT_DELETES) {
        const concurrentBatch = batch.slice(i, i + CONCURRENT_DELETES);
        
        // Delete up to CONCURRENT_DELETES events in parallel
        const deletePromises = concurrentBatch.map(async (event) => {
          try {
            const success = await deleteEvent(event.id, event.summary);
            if (success) {
              logger.info('Deleted event', {
                eventId: event.id,
                summary: event.summary,
              });
              return { success: true, eventId: event.id, event };
            }
            return { success: false, eventId: event.id, event };
          } catch (error) {
            logger.error('Failed to delete event', error, {
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
        if (i + CONCURRENT_DELETES < batch.length || batchEnd < allEventsToDelete.length) {
          await sleep(DELAY_BETWEEN_BATCHES_MS);
        }
      }
    }

    // Retry failed deletions with exponential backoff
    if (failedEvents.length > 0) {
      console.log(`\n\n⚠️  Retrying ${failedEvents.length} failed deletions with exponential backoff...\n`);
      
      const retryFailed: Array<{ id: string; summary: string }> = [];
      const initialDeleted = deleted;
      
      for (const event of failedEvents) {
        try {
          const success = await deleteEvent(event.id, event.summary, 10); // More retries for failed events
          if (success) {
            deleted++;
            logger.info('Successfully deleted event on retry', {
              eventId: event.id,
              summary: event.summary,
            });
          } else {
            retryFailed.push(event);
          }
        } catch (error) {
          retryFailed.push(event);
          logger.error('Failed to delete event after retries', error, {
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
    console.log(`   Events deleted: ${deleted}/${totalEvents}`);
    console.log(`   Note: Deleting recurring master events also cascade deletes all past and future instances.`);
    if (errors > 0) {
      console.log(`   Errors: ${errors}`);
      console.log('⚠️  Some events could not be deleted. Check logs for details.\n');
      process.exit(1);
    } else {
      console.log('   All events successfully deleted.\n');
      process.exit(0);
    }
  } catch (error) {
    logger.error('Error during deletion', error);
    console.error('\n❌ Error during deletion:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

