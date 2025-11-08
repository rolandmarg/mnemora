/**
 * Sheets Data Source
 * 
 * Adapter that wraps the existing SheetsService to implement IDataSource
 */

import sheetsClient from '../clients/google-sheets.client.js';
import { BaseDataSource } from '../base/base-data-source.js';
import type { BirthdayRecord } from '../utils/birthday-helpers.js';
import type { ReadOptions, DataSourceMetadata } from '../interfaces/data-source.interface.js';
import type { AppConfig } from '../config.js';

/**
 * Sheets data source implementation
 * 
 * Reads birthday data from Google Sheets
 */
export class SheetsDataSource extends BaseDataSource<BirthdayRecord> {
  constructor(config: AppConfig) {
    super(config);
  }

  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    const skipHeaderRow = (options?.skipHeaderRow as boolean) ?? true;
    return sheetsClient.readBirthdays(skipHeaderRow);
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

