import { BaseDataSource } from '../data-source.base.js';
import { parseRowToBirthdays } from '../../utils/birthday-helpers.util.js';
import type { BirthdayRecord } from '../../types/birthday.types.js';
import type { ReadOptions, DataSourceMetadata } from '../data-source.interface.js';
import type { AppConfig } from '../../config.js';
import type { Logger } from '../../types/logger.types.js';
import sheetsClientDefault from '../../clients/google-sheets.client.js';

type SheetsClient = typeof sheetsClientDefault;

export class SheetsDataSource extends BaseDataSource<BirthdayRecord> {
  constructor(
    config: AppConfig,
    private readonly sheetsClient: SheetsClient,
    _logger: Logger
  ) {
    super(config);
  }

  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    const skipHeaderRow = (options?.skipHeaderRow as boolean) ?? true;
    const rows = await this.sheetsClient.readRows({ skipHeaderRow });
    return rows.flatMap(row => parseRowToBirthdays(row));
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

