import { BaseDataSource } from '../data-source.base.js';
import { extractNameFromEvent, isBirthdayEvent } from '../../utils/event-helpers.util.js';
import { extractNameParts, getFullName } from '../../utils/name-helpers.util.js';
import { parseDateFromString, formatDateISO, today, startOfYear, endOfYear, getMonthInTimezone, getDateInTimezone } from '../../utils/date-helpers.util.js';
import { auditDeletionAttempt, SecurityError } from '../../utils/security.util.js';
import type { BirthdayRecord } from '../../types/birthday.types.js';
import type { Event } from '../../types/event.types.js';
import type { ReadOptions, WriteOptions, WriteResult, DeleteResult, DataSourceMetadata } from '../data-source.interface.js';
import type { AppConfig } from '../../config.js';
import type { Logger } from '../../types/logger.types.js';
import GoogleCalendarClient from '../../clients/google-calendar.client.js';

type CalendarClient = GoogleCalendarClient;

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
  constructor(
    config: AppConfig,
    private readonly calendarClient: CalendarClient,
    private readonly logger: Logger
  ) {
    super(config);
  }

  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    const { startDate, endDate } = options ?? {};

    let events: Event[];
    
    if (startDate && endDate) {
      events = await this.calendarClient.fetchEvents({ startDate, endDate });
    } else if (startDate) {
      events = await this.calendarClient.fetchEvents({ startDate, endDate: startDate });
    } else {
      const todayDate = today();
      events = await this.calendarClient.fetchEvents({ startDate: todayDate, endDate: todayDate });
    }

    const birthdayEvents = events.filter(event => isBirthdayEvent(event));
    
    const records = birthdayEvents
      .map(eventToBirthdayRecord)
      .filter((record): record is BirthdayRecord => record !== null);
    
    return records;
  }


  async delete(id: string): Promise<boolean> {
    auditDeletionAttempt(this.logger, 'CalendarDataSource.delete', { eventId: id });
    throw new SecurityError('Deletion of birthday events is disabled for security reasons');
  }

  async deleteAll(options: ReadOptions): Promise<DeleteResult> {
    auditDeletionAttempt(this.logger, 'CalendarDataSource.deleteAll', { 
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
   * Optimized to make a single API call for the full year instead of multiple calls.
   * Returns both the map and metadata about recurring events.
   */
  private async buildExistingBirthdayMap(
    birthdays: BirthdayRecord[]
  ): Promise<{ map: Map<string, boolean>; uniqueRecurringEvents: number; dateRangeYears: number }> {
    if (birthdays.length === 0) {
      return { map: new Map(), uniqueRecurringEvents: 0, dateRangeYears: 0 };
    }

    const todayDate = today();
    const currentYear = todayDate.getFullYear();
    
    // Single API call: fetch entire year at once
    const yearStart = startOfYear(new Date(currentYear, 0, 1));
    const yearEnd = endOfYear(new Date(currentYear, 0, 1));
    
    const allEvents = await this.calendarClient.fetchEvents({
      startDate: yearStart,
      endDate: yearEnd,
    });

    // Filter to birthday events only
    const birthdayEvents = allEvents.filter(isBirthdayEvent);
    
    const existingBirthdayMap = new Map<string, boolean>();
    const uniqueRecurringEvents = new Set<string>();
    
    // Get unique month/day combinations from birthdays we're syncing
    // Use timezone-aware extraction to ensure correct date components
    const uniqueDates = new Map<string, Date[]>();
    for (const birthday of birthdays) {
      const month = getMonthInTimezone(birthday.birthday); // 1-12
      const day = getDateInTimezone(birthday.birthday);
      const dateKey = `${month}-${day}`; // Month-Day key (e.g., "1-15" for Jan 15)
      
      if (!uniqueDates.has(dateKey)) {
        uniqueDates.set(dateKey, []);
      }
      uniqueDates.get(dateKey)!.push(birthday.birthday);
    }

    // Process all birthday events from the year
    for (const event of birthdayEvents) {
      const startDate = event.start?.date ?? event.start?.dateTime;
      if (!startDate) {
        continue;
      }

      const eventDate = parseDateFromString(startDate);
      const eventName = extractNameFromEvent(event);

      if (eventDate && eventName) {
        // Use timezone-aware extraction to ensure correct date components
        const eventMonth = getMonthInTimezone(eventDate);
        const eventDay = getDateInTimezone(eventDate);
        const eventDateKey = `${eventMonth}-${eventDay}`;
        
        // Check if this event matches any of the dates we're syncing
        const matchingDates = uniqueDates.get(eventDateKey);
        if (matchingDates) {
          // Check if this is a recurring event (either has recurrence rule or is an instance of one)
          // When singleEvents: true, Google Calendar expands recurring events into instances
          // with recurringEventId but without the recurrence field
          const isRecurring = !!event.recurrence || !!event.recurringEventId;
          
          if (isRecurring) {
            // Recurring event: add keys for all dates with same month/day
            // This handles both the master recurring event and expanded instances
            for (const date of matchingDates) {
              const key = this.createDuplicateKey(date, eventName);
              existingBirthdayMap.set(key, true);
            }
            uniqueRecurringEvents.add(eventName.toLowerCase().trim());
          } else {
            // Non-recurring event: only match if it's the exact date
            for (const date of matchingDates) {
              if (eventDate.getTime() === date.getTime()) {
                const key = this.createDuplicateKey(date, eventName);
                existingBirthdayMap.set(key, true);
              }
            }
          }
        }
      }
    }

    // Calculate date range years for metadata
    const dates = birthdays.map(b => b.birthday);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const dateRangeYears = Math.ceil((maxDate.getTime() - minDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

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
      this.logger.info(`Skipping duplicate birthday for ${fullName}`);
      return { added: 0, skipped: 1, errors: 0 };
    }

    // Create new birthday event
    try {
      await this.calendarClient.insertEvent({
        summary: `${fullName}'s Birthday`,
        description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
        start: { date: dateString, timeZone: 'UTC' },
        end: { date: dateString, timeZone: 'UTC' },
        recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
      });

      this.logger.info(`Birthday event created successfully`, {
        title: `${fullName}'s Birthday`,
        date: dateString,
        calendar: this.config.google.calendarId,
      });

      return { added: 1, skipped: 0, errors: 0 };
    } catch (error) {
      this.logger.error(`Error writing birthday for ${fullName}`, error);
      return { added: 0, skipped: 0, errors: 1 };
    }
  }

  async write(data: BirthdayRecord[], _options?: WriteOptions): Promise<WriteResult> {
    if (data.length === 0) {
      return { added: 0, skipped: 0, errors: 0 };
    }

    // Build map of existing birthdays to check for duplicates
    const { map: existingBirthdayMap } = await this.buildExistingBirthdayMap(data);

    // Batch duplicate check: check all birthdays first before processing
    const birthdaysToAdd: BirthdayRecord[] = [];
    let skippedCount = 0;

    for (const birthday of data) {
      const fullName = getFullName(birthday.firstName, birthday.lastName);
      const duplicateKey = this.createDuplicateKey(birthday.birthday, fullName);

      if (existingBirthdayMap.has(duplicateKey)) {
        this.logger.info(`Skipping duplicate birthday for ${fullName}`);
        skippedCount++;
      } else {
        birthdaysToAdd.push(birthday);
      }
    }

    // Early exit: if all birthdays are duplicates, skip processing
    if (birthdaysToAdd.length === 0) {
      this.logger.info(`All ${data.length} birthday(s) already exist in calendar - skipping sync`);
      return { added: 0, skipped: skippedCount, errors: 0 };
    }

    // Process only non-duplicate birthdays
    const result: WriteResult = { added: 0, skipped: skippedCount, errors: 0 };

    for (const birthday of birthdaysToAdd) {
      const status = await this.processBirthday(birthday, existingBirthdayMap);
      result.added += status.added;
      result.skipped += status.skipped;
      result.errors += status.errors;
    }
    
    return result;
  }

  isAvailable(): boolean {
    return !!(
      this.config.google.clientEmail &&
      this.config.google.privateKey &&
      this.config.google.calendarId
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

