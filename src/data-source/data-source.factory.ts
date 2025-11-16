import { CalendarDataSource } from './implementations/calendar.source.js';
import { SheetsDataSource } from './implementations/sheets.source.js';
import type { AppContext } from '../app-context.js';

export class DataSourceFactory {

  static createCalendarDataSource(ctx: AppContext): CalendarDataSource {
    return new CalendarDataSource(ctx);
  }

  static createSheetsDataSource(ctx: AppContext): SheetsDataSource {
    return new SheetsDataSource(ctx);
  }
}

