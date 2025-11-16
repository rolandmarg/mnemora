import { BaseDataSource } from '../data-source/data-source.base.js';
import { parseRowToBirthdays } from '../utils/birthday-helpers.util.js';
import type { BirthdayRecord } from '../types/birthday.types.js';
import type { ReadOptions, DataSourceMetadata } from '../data-source/data-source.interface.js';
import type { AppContext } from '../app-context.js';

export class SheetsDataSource extends BaseDataSource<BirthdayRecord> {
  constructor(private readonly ctx: AppContext) {
    super(ctx.config);
  }

  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    const skipHeaderRow = (options?.skipHeaderRow as boolean) ?? true;
    const rows = await this.ctx.clients.sheets.readRows({ skipHeaderRow });
    return rows.flatMap(row => parseRowToBirthdays(row));
  }

  isAvailable(): boolean {
    return !!(
      this.ctx.config.google.clientEmail &&
      this.ctx.config.google.privateKey &&
      this.ctx.config.google.spreadsheetId
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

