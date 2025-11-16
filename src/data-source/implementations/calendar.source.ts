import { BaseDataSource } from '../data-source.base.js';
import { extractNameFromEvent, isBirthdayEvent } from '../../utils/event-helpers.util.js';
import { extractNameParts, getFullName } from '../../utils/name-helpers.util.js';
import { parseDateFromString, formatDateISO, today } from '../../utils/date-helpers.util.js';
import { getDateRangeForBirthdays } from '../../utils/birthday-helpers.util.js';
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
    
    return birthdayEvents
      .map(eventToBirthdayRecord)
      .filter((record): record is BirthdayRecord => record !== null);
  }

  async checkForDuplicates(birthday: BirthdayRecord): Promise<BirthdayRecord[]> {
    try {
      const eventDate = new Date(birthday.birthday);
      const existingBirthdays = await this.read({
        startDate: eventDate,
        endDate: eventDate,
      });
      
      return existingBirthdays.filter(existing => {
        const firstNameMatch = existing.firstName.toLowerCase() === birthday.firstName.toLowerCase();
        const lastNameMatch = (existing.lastName ?? '').toLowerCase() === (birthday.lastName ?? '').toLowerCase();
        return firstNameMatch && lastNameMatch;
      });
    } catch (error) {
      this.ctx.logger.error('Error checking for duplicates', error);
      return [];
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
    const getLookupKey = (b: BirthdayRecord) => 
      `${formatDateISO(new Date(b.birthday))}|${b.firstName.toLowerCase()}|${(b.lastName ?? '').toLowerCase()}`;
    
    const dateRange = getDateRangeForBirthdays(data);
    const existingBirthdays = dateRange 
      ? await this.read({ startDate: dateRange.minDate, endDate: dateRange.maxDate }).catch(() => [])
      : [];
    
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
          this.ctx.logger.info(`Skipping duplicate birthday for ${fullName}`);
          return { ...acc, skipped: acc.skipped + 1 };
        }

        const dateString = formatDateISO(new Date(birthday.birthday));
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

