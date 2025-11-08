/**
 * Data Source Factory
 * 
 * Creates data source instances based on configuration
 */

import type { IDataSource } from '../interfaces/data-source.interface.js';
import type { DataSourceType, DataSourceConfig } from '../types/index.js';
import { config } from '../../config.js';

/**
 * Factory for creating data source instances
 * 
 * Usage:
 * ```typescript
 * const source = DataSourceFactory.create('calendar', config);
 * const birthdays = await source.read({ startDate, endDate });
 * ```
 */
export class DataSourceFactory {
  /**
   * Create a data source instance based on type
   * 
   * @param type - The type of data source to create
   * @param sourceConfig - Optional configuration specific to this source
   * @returns Data source instance implementing IDataSource
   * @throws Error if type is not supported
   */
  static create<T>(type: DataSourceType, sourceConfig?: Partial<DataSourceConfig>): IDataSource<T> {
    switch (type) {
      case 'calendar':
        // Lazy import to avoid circular dependencies
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { CalendarDataSource } = require('../sources/calendar.source.js');
        return new CalendarDataSource(config) as IDataSource<T>;

      case 'sheets':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { SheetsDataSource } = require('../sources/sheets.source.js');
        return new SheetsDataSource(config) as IDataSource<T>;

      case 'csv':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { CSVDataSource } = require('../sources/csv.source.js');
        return new CSVDataSource(sourceConfig) as IDataSource<T>;

      case 'contacts':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ContactsDataSource } = require('../sources/contacts.source.js');
        return new ContactsDataSource(sourceConfig) as IDataSource<T>;

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
  static createMultiple<T>(configs: DataSourceConfig[]): IDataSource<T>[] {
    return configs.map(config => this.create<T>(config.type, config));
  }
}

