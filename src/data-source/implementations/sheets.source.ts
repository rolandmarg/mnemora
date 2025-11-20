import { BaseDataSource } from '../data-source.base.js';
import { parseRowToBirthdays } from '../../utils/birthday-helpers.util.js';
import type { BirthdayRecord } from '../../types/birthday.types.js';
import type { ReadOptions, DataSourceMetadata } from '../data-source.interface.js';
import type { AppContext } from '../../app-context.js';

export class SheetsDataSource extends BaseDataSource<BirthdayRecord> {
  constructor(private readonly ctx: AppContext) {
    super(ctx.config);
  }

  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    const skipHeaderRow = (options?.skipHeaderRow as boolean) ?? true;
    const rows = await this.ctx.clients.sheets.readRows({ skipHeaderRow });
    
    this.ctx.logger.info(`Sheets readRows returned ${rows.length} row(s)`, {
      rowCount: rows.length,
      firstFewRows: rows.slice(0, 3).map(row => ({
        length: row.length,
        columns: row.slice(0, 6), // First 6 columns for debugging
      })),
    });

    const parsedBirthdays: BirthdayRecord[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const parsed = parseRowToBirthdays(row);
      
      if (parsed.length === 0 && row.some(cell => cell?.trim())) {
        // Row has data but didn't parse - log it for debugging
        this.ctx.logger.warn(`Row ${i + 1} has data but didn't parse into any birthdays`, {
          rowIndex: i,
          rowLength: row.length,
          rowData: row,
        });
      }
      
      parsedBirthdays.push(...parsed);
    }

    this.ctx.logger.info(`Parsed ${parsedBirthdays.length} birthday(s) from ${rows.length} row(s)`, {
      rowsRead: rows.length,
      birthdaysParsed: parsedBirthdays.length,
    });

    return parsedBirthdays;
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

