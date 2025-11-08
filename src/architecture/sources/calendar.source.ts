/**
 * Calendar Data Source
 * 
 * Adapter that wraps the existing CalendarService to implement IDataSource
 */

import calendarService from '../../services/calendar.js';
import type { CalendarEvent } from '../../types/index.js';
import type { IDataSource, ReadOptions, DataSourceMetadata } from '../interfaces/data-source.interface.js';
import type { AppConfig } from '../../config.js';

/**
 * Calendar data source implementation
 * 
 * Reads birthday events from Google Calendar
 */
export class CalendarDataSource implements IDataSource<CalendarEvent> {
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async read(options?: ReadOptions): Promise<CalendarEvent[]> {
    const { startDate, endDate } = options ?? {};

    if (startDate && endDate) {
      return calendarService.getEventsForDateRange(startDate, endDate);
    }

    if (startDate) {
      return calendarService.getEventsForDate(startDate);
    }

    // Default: get today's events
    const today = new Date();
    return calendarService.getEventsForDate(today);
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
      description: 'Reads birthday events from Google Calendar',
      supportsRead: true,
      supportsWrite: false,
      capabilities: ['read', 'date-range-filter'],
    };
  }
}

