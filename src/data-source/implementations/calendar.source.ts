import { BaseDataSource } from '../data-source.base.js';
import { extractNameFromEvent, isBirthdayEvent } from '../../utils/event-helpers.util.js';
import { extractNameParts, getFullName } from '../../utils/name-helpers.util.js';
import { parseDateFromString, formatDateISO, today } from '../../utils/date-helpers.util.js';
import { auditDeletionAttempt, SecurityError } from '../../utils/security.util.js';
import type { BirthdayRecord } from '../../types/birthday.types.js';
import type { Event } from '../../types/event.types.js';
import type { ReadOptions, WriteOptions, WriteResult, DeleteResult, DataSourceMetadata } from '../data-source.interface.js';
import type { AppContext } from '../../app-context.js';

function eventToBirthdayRecord(event: Event): BirthdayRecord | null {
  const startDate = event.start?.date ?? event.start?.dateTime;
  if (!startDate) {
    return null;
  }
  
  try {
    const birthday = parseDateFromString(startDate);
    const fullName = extractNameFromEvent(event);
    const { firstName, lastName } = extractNameParts(fullName);
    
    const yearMatch = event.description?.match(/born (\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    
    return {
      firstName,
      lastName: lastName ?? undefined,
      birthday,
      year,
    };
  } catch {
    return null;
  }
}

export class CalendarDataSource extends BaseDataSource<BirthdayRecord> {
  constructor(private readonly ctx: AppContext) {
    super(ctx.config);
  }

  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    const { startDate, endDate } = options ?? {};

    let events: Event[];
    
    if (startDate && endDate) {
      events = await this.ctx.clients.calendar.fetchEvents({ startDate, endDate });
    } else if (startDate) {
      events = await this.ctx.clients.calendar.fetchEvents({ startDate, endDate: startDate });
    } else {
      const todayDate = today();
      events = await this.ctx.clients.calendar.fetchEvents({ startDate: todayDate, endDate: todayDate });
    }

    this.ctx.logger.info(`Calendar read: fetched ${events.length} total event(s) from API`, {
      dateRange: startDate && endDate ? {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      } : undefined,
      eventSummaries: events.slice(0, 5).map(e => e.summary),
    });

    const birthdayEvents = events.filter(event => isBirthdayEvent(event));
    
    this.ctx.logger.info(`Calendar read: filtered to ${birthdayEvents.length} birthday event(s)`, {
      totalEvents: events.length,
      birthdayEvents: birthdayEvents.length,
      sampleSummaries: birthdayEvents.slice(0, 3).map(e => e.summary),
    });
    
    const records = birthdayEvents
      .map(eventToBirthdayRecord)
      .filter((record): record is BirthdayRecord => record !== null);
    
    return records;
  }


  async delete(id: string): Promise<boolean> {
    auditDeletionAttempt(this.ctx, 'CalendarDataSource.delete', { eventId: id });
    throw new SecurityError('Deletion of birthday events is disabled for security reasons');
  }

  async deleteAll(options: ReadOptions): Promise<DeleteResult> {
    auditDeletionAttempt(this.ctx, 'CalendarDataSource.deleteAll', { 
      startDate: options.startDate?.toISOString(),
      endDate: options.endDate?.toISOString(),
    });
    throw new SecurityError('Deletion of birthday events is disabled for security reasons');
  }

  /**
   * Creates a duplicate detection key from a date and name.
   * Format: "YYYY-MM-DD|lowercase_name"
   */
  private createDuplicateKey(date: Date, name: string): string {
    const dateKey = formatDateISO(date);
    const normalizedName = name.toLowerCase().trim();
    return `${dateKey}|${normalizedName}`;
  }

  /**
   * Builds a map of existing birthdays for duplicate detection.
   * Fetches existing events in the date range and maps them by date+name.
   * Returns both the map and metadata about recurring events.
   */
  private async buildExistingBirthdayMap(
    birthdays: BirthdayRecord[]
  ): Promise<{ map: Map<string, boolean>; uniqueRecurringEvents: number; dateRangeYears: number }> {
    if (birthdays.length === 0) {
      return { map: new Map(), uniqueRecurringEvents: 0, dateRangeYears: 0 };
    }

    // Calculate date range covering all birthdays to add
    const dates = birthdays.map(b => b.birthday);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Fetch existing events in that date range
    const existingEvents = await this.ctx.clients.calendar.fetchEvents({
      startDate: minDate,
      endDate: maxDate,
    });

    // Filter to only birthday events and build map
    const existingBirthdayEvents = existingEvents.filter(isBirthdayEvent);
    const existingBirthdayMap = new Map<string, boolean>();
    const uniqueRecurringEvents = new Set<string>();

    for (const event of existingBirthdayEvents) {
      const startDate = event.start?.date ?? event.start?.dateTime;
      if (!startDate) {
        continue;
      }

      const eventDate = parseDateFromString(startDate);
      const eventName = extractNameFromEvent(event);

      if (eventDate && eventName) {
        const key = this.createDuplicateKey(eventDate, eventName);
        existingBirthdayMap.set(key, true);

        // Track unique recurring events (by name only)
        if (event.recurrence) {
          uniqueRecurringEvents.add(eventName.toLowerCase().trim());
        }
      }
    }

    const dateRangeYears = Math.ceil((maxDate.getTime() - minDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    // Log with context about recurring events if relevant
    const logMessage = dateRangeYears > 1 && uniqueRecurringEvents.size > 0
      ? `Found ${existingBirthdayMap.size} existing birthday event instance(s) in date range (${uniqueRecurringEvents.size} unique recurring events expanded across ${dateRangeYears} year(s))`
      : `Found ${existingBirthdayMap.size} existing birthday event(s) in date range`;

    this.ctx.logger.info(logMessage, {
      dateRange: {
        start: formatDateISO(minDate),
        end: formatDateISO(maxDate),
      },
      birthdaysToAdd: birthdays.length,
      uniqueRecurringEvents: uniqueRecurringEvents.size,
      dateRangeYears,
    });

    return {
      map: existingBirthdayMap,
      uniqueRecurringEvents: uniqueRecurringEvents.size,
      dateRangeYears,
    };
  }

  /**
   * Processes a single birthday: checks for duplicates and creates event if needed.
   * Returns the result status for this birthday.
   */
  private async processBirthday(
    birthday: BirthdayRecord,
    existingBirthdayMap: Map<string, boolean>
  ): Promise<{ added: number; skipped: number; errors: number }> {
    const fullName = getFullName(birthday.firstName, birthday.lastName);
    const dateString = formatDateISO(birthday.birthday);
    const duplicateKey = this.createDuplicateKey(birthday.birthday, fullName);

    // Check if birthday already exists
    if (existingBirthdayMap.has(duplicateKey)) {
      this.ctx.logger.info(`Skipping existing birthday event for ${fullName}`, {
        date: dateString,
      });
      return { added: 0, skipped: 1, errors: 0 };
    }

    // Create new birthday event
    try {
      this.ctx.logger.info(`Creating birthday event for ${fullName}`, {
        date: dateString,
      });

      await this.ctx.clients.calendar.insertEvent({
        summary: `${fullName}'s Birthday`,
        description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
        start: { date: dateString, timeZone: 'UTC' },
        end: { date: dateString, timeZone: 'UTC' },
        recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
      });

      this.ctx.logger.info(`Birthday event created successfully`, {
        title: `${fullName}'s Birthday`,
        date: dateString,
        calendar: this.ctx.config.google.calendarId,
      });

      return { added: 1, skipped: 0, errors: 0 };
    } catch (error) {
      this.ctx.logger.error(`Error writing birthday for ${fullName}`, error);
      return { added: 0, skipped: 0, errors: 1 };
    }
  }

  async write(data: BirthdayRecord[], _options?: WriteOptions): Promise<WriteResult> {
    this.ctx.logger.info(`Calendar write called with ${data.length} birthday record(s)`, {
      recordCount: data.length,
    });

    // Early return for empty input
    if (data.length === 0) {
      this.ctx.logger.warn('Calendar write called with empty array - nothing to write');
      return { added: 0, skipped: 0, errors: 0 };
    }

    // Build map of existing birthdays to check for duplicates
    const { map: existingBirthdayMap } = await this.buildExistingBirthdayMap(data);

    // Process each birthday and accumulate results
    const result: WriteResult = { added: 0, skipped: 0, errors: 0 };

    for (const birthday of data) {
      const status = await this.processBirthday(birthday, existingBirthdayMap);
      result.added += status.added;
      result.skipped += status.skipped;
      result.errors += status.errors;
    }
    
    this.ctx.logger.info('Calendar write completed', {
      total: data.length,
      added: result.added,
      skipped: result.skipped,
      errors: result.errors,
    });
    
    return result;
  }

  isAvailable(): boolean {
    return !!(
      this.ctx.config.google.clientEmail &&
      this.ctx.config.google.privateKey &&
      this.ctx.config.google.calendarId
    );
  }

  getMetadata(): DataSourceMetadata {
    return {
      name: 'Google Calendar',
      type: 'calendar',
      description: 'Reads and writes birthday events to Google Calendar',
      supportsRead: true,
      supportsWrite: true,
      capabilities: ['read', 'write', 'date-range-filter'],
    };
  }
}

