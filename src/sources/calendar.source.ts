/**
 * Calendar Data Source
 * 
 * Adapter that wraps the existing CalendarService to implement IDataSource
 * Converts Event to BirthdayRecord at the boundary
 */

import calendarClient, { extractNameFromEvent, isBirthdayEvent } from '../clients/google-calendar.client.js';
import birthdayService from '../services/birthday.js';
import { extractNameParts } from '../utils/name/name-helpers.js';
import { parseDateFromString } from '../utils/date.js';
import { BaseDataSource } from '../base/base-data-source.js';
import type { BirthdayRecord } from '../utils/name/birthday-parser.js';
import type { ReadOptions, WriteOptions, WriteResult, DataSourceMetadata } from '../interfaces/data-source.interface.js';
import type { AppConfig } from '../config.js';
import type { Event } from '../utils/event-helpers.js';

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

    // Filter for birthday events and convert to BirthdayRecord
    return events
      .filter(event => isBirthdayEvent(event))
      .map(eventToBirthdayRecord)
      .filter((record): record is BirthdayRecord => record !== null);
  }

  async write(data: BirthdayRecord[], _options?: WriteOptions): Promise<WriteResult> {
    // Write each birthday record to the calendar
    // birthdayService.addBirthday() handles duplicate checking internally
    let added = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const birthday of data) {
      try {
        const wasAdded = await birthdayService.addBirthday(birthday);
        if (wasAdded) {
          added++;
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        console.error(
          `Error writing birthday for ${birthday.firstName} ${birthday.lastName ?? ''}`,
          error
        );
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

