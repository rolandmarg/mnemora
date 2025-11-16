import { CalendarDataSource } from '../sources/calendar.source.js';
import { SheetsDataSource } from '../sources/sheets.source.js';
import { config } from '../config.js';

export class DataSourceFactory {

  static createCalendarDataSource(): CalendarDataSource {
    return new CalendarDataSource(config);
  }

  static createSheetsDataSource(): SheetsDataSource {
    return new SheetsDataSource(config);
  }
}

