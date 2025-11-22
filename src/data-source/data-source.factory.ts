import { CalendarDataSource } from './implementations/calendar.source.js';
import { SheetsDataSource } from './implementations/sheets.source.js';
import type { AppConfig } from '../config.js';
import type { Logger } from '../types/logger.types.js';
import calendarClientDefault from '../clients/google-calendar.client.js';
import sheetsClientDefault from '../clients/google-sheets.client.js';

type CalendarClient = typeof calendarClientDefault;
type SheetsClient = typeof sheetsClientDefault;

export class DataSourceFactory {

  static createCalendarDataSource(
    config: AppConfig,
    calendarClient: CalendarClient,
    logger: Logger
  ): CalendarDataSource {
    return new CalendarDataSource(config, calendarClient, logger);
  }

  static createSheetsDataSource(
    config: AppConfig,
    sheetsClient: SheetsClient,
    logger: Logger
  ): SheetsDataSource {
    return new SheetsDataSource(config, sheetsClient, logger);
  }
}

