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

    const birthdayEvents = events.filter(event => isBirthdayEvent(event));
    
    const records = birthdayEvents
      .map(eventToBirthdayRecord)
      .filter((record): record is BirthdayRecord => record !== null);
    
    // Deduplicate records by month/day, first name, and last name
    // This prevents sending multiple messages for the same person when duplicates exist
    // Use month/day pattern (not exact date) because recurring events appear with current year dates
    // but may have been created with different birth years, causing duplicates
    const seen = new Set<string>();
    const deduplicated = records.filter(record => {
      const month = String(record.birthday.getMonth() + 1).padStart(2, '0');
      const day = String(record.birthday.getDate()).padStart(2, '0');
      const key = `${month}-${day}|${record.firstName.toLowerCase()}|${(record.lastName ?? '').toLowerCase()}`;
      if (seen.has(key)) {
        this.ctx.logger.warn(`Deduplicating duplicate birthday record: ${getFullName(record.firstName, record.lastName)} on ${formatDateISO(new Date(record.birthday))}`);
        return false;
      }
      seen.add(key);
      return true;
    });
    
    if (deduplicated.length < records.length) {
      this.ctx.logger.info(`Deduplicated ${records.length - deduplicated.length} duplicate birthday record(s)`, {
        originalCount: records.length,
        deduplicatedCount: deduplicated.length,
      });
    }
    
    return deduplicated;
  }

  async checkForDuplicates(birthday: BirthdayRecord): Promise<BirthdayRecord[]> {
    try {
      // Check in current year range, not just the birth date
      // Birthday events are recurring and appear in the current year
      const currentYear = new Date().getFullYear();
      const checkStartDate = new Date(currentYear, 0, 1);
      const checkEndDate = new Date(currentYear + 1, 11, 31);
      
      const existingBirthdays = await this.read({
        startDate: checkStartDate,
        endDate: checkEndDate,
      });
      
      // Match by name and date (month/day), regardless of year
      // Since events are recurring, we match the date pattern, not the exact year
      const birthdayMonth = birthday.birthday.getMonth();
      const birthdayDay = birthday.birthday.getDate();
      
      return existingBirthdays.filter(existing => {
        const firstNameMatch = existing.firstName.toLowerCase() === birthday.firstName.toLowerCase();
        const lastNameMatch = (existing.lastName ?? '').toLowerCase() === (birthday.lastName ?? '').toLowerCase();
        const dateMatch = existing.birthday.getMonth() === birthdayMonth && 
                         existing.birthday.getDate() === birthdayDay;
        return firstNameMatch && lastNameMatch && dateMatch;
      });
    } catch (error) {
      this.ctx.logger.error('CRITICAL: Failed to check for duplicates', error, {
        errorType: 'duplicate_check_failed',
        impact: 'Cannot safely sync - would create duplicates',
        birthday: `${birthday.firstName} ${birthday.lastName ?? ''}`,
      });
      // Throw error instead of returning empty array to prevent duplicate creation
      throw new Error(`Failed to check for duplicate birthdays: ${error instanceof Error ? error.message : String(error)}. Cannot safely sync without duplicate check.`);
    }
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

  async write(data: BirthdayRecord[], _options?: WriteOptions): Promise<WriteResult> {
    this.ctx.logger.info(`Calendar write called with ${data.length} birthday record(s)`, {
      recordCount: data.length,
    });

    if (data.length === 0) {
      this.ctx.logger.warn('Calendar write called with empty array - nothing to write');
      return { added: 0, skipped: 0, errors: 0 };
    }

    // IMPORTANT: Match by name and month/day, NOT by exact date including year
    // Recurring events appear with current year dates (e.g., 2025-05-31) but were created with birth year dates (e.g., 1990-05-31)
    // So we need to match by month/day pattern, not exact date
    const getLookupKey = (b: BirthdayRecord) => {
      const month = String(b.birthday.getMonth() + 1).padStart(2, '0');
      const day = String(b.birthday.getDate()).padStart(2, '0');
      return `${month}-${day}|${b.firstName.toLowerCase()}|${(b.lastName ?? '').toLowerCase()}`;
    };
    
    // Check for duplicates in current year range to find recurring event instances
    const currentYear = new Date().getFullYear();
    const checkStartDate = new Date(currentYear, 0, 1);
    const checkEndDate = new Date(currentYear + 1, 11, 31); // Check current year + next year to catch all recurring instances
    
    this.ctx.logger.info('Checking for existing birthdays in calendar', {
      dateRange: {
        min: checkStartDate.toISOString().split('T')[0],
        max: checkEndDate.toISOString().split('T')[0],
      },
      note: 'Checking current year range and matching by month/day pattern (not exact date) because events are recurring',
    });

    // CRITICAL: If we can't read existing birthdays, we MUST fail rather than create duplicates
    // Returning an empty array would cause all birthdays to be created again, leading to massive duplication
    const existingBirthdays = await this.read({ 
      startDate: checkStartDate, 
      endDate: checkEndDate 
    }).catch((error) => {
      this.ctx.logger.error('CRITICAL: Failed to read existing birthdays for duplicate check', error, {
        errorType: 'duplicate_check_failed',
        impact: 'Cannot safely sync - would create duplicates',
      });
      // Throw error instead of returning empty array to prevent duplicate creation
      throw new Error(`Failed to check for duplicate birthdays: ${error instanceof Error ? error.message : String(error)}. Cannot safely sync without duplicate check.`);
    });
    
    this.ctx.logger.info(`Found ${existingBirthdays.length} existing birthday event(s) in calendar (current year range)`);
    
    // Build map using month/day pattern for matching
    const existingBirthdaysMap = existingBirthdays.reduce((map, b) => {
      const key = getLookupKey(b);
      (map[key] ??= []).push(b);
      return map;
    }, {} as Record<string, BirthdayRecord[]>);
    
    const result = await data.reduce(async (accPromise, birthday) => {
      const acc = await accPromise;
      try {
        const fullName = getFullName(birthday.firstName, birthday.lastName);
        const lookupKey = getLookupKey(birthday);
        
        if (existingBirthdaysMap[lookupKey]?.length) {
          this.ctx.logger.info(`Skipping duplicate birthday for ${fullName}`, {
            lookupKey,
            existingCount: existingBirthdaysMap[lookupKey].length,
            matchType: 'month/day pattern',
          });
          return { ...acc, skipped: acc.skipped + 1 };
        }

        // Check for duplicates right before inserting to handle race conditions
        // Note: This reduces but doesn't fully eliminate race conditions in concurrent writes.
        // If two processes write simultaneously, both might pass the checks before either's
        // insert is visible to the calendar API. This is acceptable for this use case as
        // duplicates are handled by deduplication in read() and won't cause duplicate messages.
        const duplicates = await this.checkForDuplicates(birthday);
        if (duplicates.length > 0) {
          this.ctx.logger.info(`Skipping duplicate birthday for ${fullName}`, {
            lookupKey,
            duplicateCount: duplicates.length,
            matchType: 'month/day pattern',
          });
          return { ...acc, skipped: acc.skipped + 1 };
        }

        const dateString = formatDateISO(new Date(birthday.birthday));
        this.ctx.logger.info(`Creating birthday event for ${fullName}`, {
          date: dateString,
          lookupKey,
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
        
        existingBirthdaysMap[lookupKey] = [birthday];
        return { ...acc, added: acc.added + 1 };
      } catch (error) {
        this.ctx.logger.error(`Error writing birthday for ${birthday.firstName} ${birthday.lastName ?? ''}`, error);
        return { ...acc, errors: acc.errors + 1 };
      }
    }, Promise.resolve({ added: 0, skipped: 0, errors: 0 }));
    
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
      capabilities: ['read', 'write', 'date-range-filter', 'duplicate-check'],
    };
  }
}

