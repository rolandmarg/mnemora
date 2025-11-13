/**
 * Data Source Factory
 * 
 * Creates data source instances based on configuration
 */

import { CalendarDataSource } from '../sources/calendar.source.js';
import { SheetsDataSource } from '../sources/sheets.source.js';
import { config } from '../config.js';

/**
 * Factory for creating data source instances
 * 
 * Usage:
 * ```typescript
 * const source = DataSourceFactory.createCalendarDataSource();
 * const birthdays = await source.read({ startDate, endDate });
 * ```
 */
export class DataSourceFactory {

  static createCalendarDataSource(): CalendarDataSource {
    return new CalendarDataSource(config);
  }

  static createSheetsDataSource(): SheetsDataSource {
    return new SheetsDataSource(config);
  }
}

