/**
 * Sheets Data Source
 * 
 * Adapter that wraps the existing SheetsService to implement IDataSource
 */

import sheetsService from '../../services/sheets.js';
import type { BirthdayInput } from '../../utils/name/birthday-parser.js';
import type { IDataSource, ReadOptions, DataSourceMetadata } from '../interfaces/data-source.interface.js';
import type { AppConfig } from '../../config.js';

/**
 * Sheets data source implementation
 * 
 * Reads birthday data from Google Sheets
 */
export class SheetsDataSource implements IDataSource<BirthdayInput> {
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async read(options?: ReadOptions): Promise<BirthdayInput[]> {
    const skipHeaderRow = (options?.skipHeaderRow as boolean) ?? true;
    return sheetsService.readBirthdays(skipHeaderRow);
  }

  isAvailable(): boolean {
    return !!(
      this.config.google.clientEmail &&
      this.config.google.privateKey &&
      this.config.google.spreadsheetId
    );
  }

  getMetadata(): DataSourceMetadata {
    return {
      name: 'Google Sheets',
      type: 'sheets',
      description: 'Reads birthday data from Google Sheets',
      supportsRead: true,
      supportsWrite: false,
      capabilities: ['read', 'header-row-skip'],
    };
  }
}

