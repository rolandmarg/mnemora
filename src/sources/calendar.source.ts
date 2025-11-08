/**
 * Calendar Data Source
 * 
 * Adapter that wraps the existing CalendarService to implement IDataSource
 * Converts Event to BirthdayRecord at the boundary
 */

import calendarClient from '../clients/google-calendar.client.js';
import { extractNameFromEvent, isBirthdayEvent } from '../utils/event-helpers.js';
import { extractNameParts } from '../utils/name-helpers.js';
import { parseDateFromString, fromDate, formatDateISO } from '../utils/date-helpers.js';
import { getFullName } from '../utils/name-helpers.js';
import { BaseDataSource } from '../base/base-data-source.js';
import { getDateRangeForBirthdays, type BirthdayRecord } from '../utils/birthday-helpers.js';
import type { ReadOptions, WriteOptions, WriteResult, DeleteResult, DataSourceMetadata } from '../interfaces/data-source.interface.js';
import type { AppConfig } from '../config.js';
import type { Event } from '../utils/event-helpers.js';
import { config } from '../config.js';

/**
 * Convert Event to BirthdayRecord
 */
function eventToBirthdayRecord(event: Event): BirthdayRecord | null {
  const startDate = event.start?.date ?? event.start?.dateTime;
  if (!startDate) return null;
  
  try {
    const birthday = parseDateFromString(startDate);
    const fullName = extractNameFromEvent(event);
    const { firstName, lastName } = extractNameParts(fullName);
    
    // Extract year from description if available (e.g., "Birthday of John Doe (born 1990)")
    const yearMatch = event.description?.match(/born (\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    
    return {
      firstName,
      lastName: lastName || undefined,
      birthday,
      year,
    };
  } catch {
    return null;
  }
}

/**
 * Calendar data source implementation
 * 
 * Reads birthday events from Google Calendar and converts them to BirthdayRecord
 */
export class CalendarDataSource extends BaseDataSource<BirthdayRecord> {
  constructor(config: AppConfig) {
    super(config);
  }

  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    const { startDate, endDate } = options ?? {};

    let events: Event[];
    
    if (startDate && endDate) {
      events = await calendarClient.fetchEvents({ startDate, endDate });
    } else if (startDate) {
      events = await calendarClient.fetchEvents({ startDate, endDate: startDate });
    } else {
      // Default: get today's events
      const todayDate = new Date();
      events = await calendarClient.fetchEvents({ startDate: todayDate, endDate: todayDate });
    }

    // Filter for birthday events
    const birthdayEvents = events.filter(event => isBirthdayEvent(event));
    
    // Convert to BirthdayRecord
    return birthdayEvents
      .map(eventToBirthdayRecord)
      .filter((record): record is BirthdayRecord => record !== null);
  }

  /**
   * Check for duplicate birthday events
   */
  async checkForDuplicates(birthday: BirthdayRecord): Promise<BirthdayRecord[]> {
    try {
      const eventDate = fromDate(birthday.birthday);
      const existingBirthdays = await this.read({
        startDate: eventDate,
        endDate: eventDate,
      });
      
      // Filter for matching birthdays by name
      return existingBirthdays.filter(existing => {
        const firstNameMatch = existing.firstName.toLowerCase() === birthday.firstName.toLowerCase();
        const lastNameMatch = (existing.lastName ?? '').toLowerCase() === (birthday.lastName ?? '').toLowerCase();
        return firstNameMatch && lastNameMatch;
      });
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return [];
    }
  }

  /**
   * Delete a single event from the calendar
   */
  async delete(id: string): Promise<boolean> {
    return calendarClient.deleteEvent(id);
  }

  /**
   * Delete all birthdays in bulk mode by date range
   */
  async deleteAll(options: ReadOptions): Promise<DeleteResult> {
    const { startDate, endDate } = options;
    
    if (!startDate || !endDate) {
      return { deletedCount: 0, skippedCount: 0, errorCount: 0 };
    }
    
    // Fetch events with IDs for deletion
    const events = await calendarClient.fetchEvents({ startDate, endDate });
    const birthdayEvents = events.filter(event => isBirthdayEvent(event));
    
    // Delete all birthday events
    return calendarClient.deleteAllEvents(birthdayEvents);
  }

  async write(data: BirthdayRecord[], _options?: WriteOptions): Promise<WriteResult> {
    // Optimization: Batch fetch all existing birthdays for the date range upfront
    // This reduces API calls from 2N (N for duplicate checks + N for inserts) to N+1
    const getLookupKey = (b: BirthdayRecord) => 
      `${formatDateISO(fromDate(b.birthday))}|${b.firstName.toLowerCase()}|${(b.lastName ?? '').toLowerCase()}`;
    
    const dateRange = getDateRangeForBirthdays(data);
    const existingBirthdays = dateRange 
      ? await this.read({ startDate: dateRange.minDate, endDate: dateRange.maxDate }).catch(() => [])
      : [];
    
    const existingBirthdaysMap = existingBirthdays.reduce((map, b) => {
      const key = getLookupKey(b);
      (map[key] ??= []).push(b);
      return map;
    }, {} as Record<string, BirthdayRecord[]>);
    
    let added = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const birthday of data) {
      try {
        const fullName = getFullName(birthday.firstName, birthday.lastName);
        const lookupKey = getLookupKey(birthday);
        
        if (existingBirthdaysMap[lookupKey]?.length) {
          console.log(`⏭️  Skipping duplicate birthday for ${fullName}`);
          skipped++;
          continue;
        }

        const dateString = formatDateISO(fromDate(birthday.birthday));
        await calendarClient.insertEvent({
          summary: `${fullName}'s Birthday`,
          description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
          start: { date: dateString, timeZone: 'UTC' },
          end: { date: dateString, timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
        });
        
        console.log(`\n✅ Birthday event created successfully!`);
        console.log(`   Title: ${fullName}'s Birthday`);
        console.log(`   Date: ${dateString}`);
        console.log(`   Calendar: ${config.google.calendarId}`);
        
        existingBirthdaysMap[lookupKey] = [birthday]; // Cache to prevent duplicates in same batch
        added++;
      } catch (error) {
        errors++;
        console.error(`Error writing birthday for ${birthday.firstName} ${birthday.lastName ?? ''}`, error);
      }
    }
    
    return { added, skipped, errors };
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
      capabilities: ['read', 'write', 'date-range-filter', 'duplicate-check'],
    };
  }
}

