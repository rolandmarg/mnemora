/**
 * Data Source Factory
 * 
 * Creates data source instances based on configuration
 */

import { CalendarDataSource } from '../sources/calendar.source.js';
import { SheetsDataSource } from '../sources/sheets.source.js';
import { BaseDataSource } from '../base/base-data-source.js';
import { config } from '../config.js';

/**
 * Supported data source types
 */
export type DataSourceType = 'calendar' | 'sheets';

/**
 * Configuration for data source factory
 */
export interface DataSourceConfig {
  type: DataSourceType;
  [key: string]: unknown;
}

/**
 * Factory for creating data source instances
 * 
 * Usage:
 * ```typescript
 * const source = DataSourceFactory.create('calendar');
 * const birthdays = await source.read({ startDate, endDate });
 * ```
 */
export class DataSourceFactory {
  /**
   * Create a calendar data source
   */
  static create(type: 'calendar'): CalendarDataSource;
  /**
   * Create a sheets data source
   */
  static create(type: 'sheets'): SheetsDataSource;
  /**
   * Create a data source instance based on type
   * 
   * @param type - The type of data source to create
   * @returns Data source instance extending BaseDataSource
   * @throws Error if type is not supported
   */
  static create(type: DataSourceType): BaseDataSource<unknown> {
    switch (type) {
      case 'calendar':
        return new CalendarDataSource(config);

      case 'sheets':
        return new SheetsDataSource(config);

      default:
        throw new Error(`Unsupported data source type: ${type}`);
    }
  }

  /**
   * Create multiple data sources from configuration
   * 
   * @param configs - Array of data source configurations
   * @returns Array of data source instances
   */
  static createMultiple(configs: DataSourceConfig[]): BaseDataSource<unknown>[] {
    return configs.map(config => {
      switch (config.type) {
        case 'calendar':
          return this.create('calendar');
        case 'sheets':
          return this.create('sheets');
        default:
          throw new Error(`Unsupported data source type: ${config.type}`);
      }
    });
  }
}

