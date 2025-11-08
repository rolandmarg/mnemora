import { google } from 'googleapis';
import { config } from '../config.js';
import { extractNameParts, sanitizeNames } from '../utils/name/name-helpers.js';
import { parseDateString } from '../utils/date.js';
import type { BirthdayRecord } from '../utils/name/birthday-parser.js';
import type { sheets_v4 } from 'googleapis';

/**
 * Google Sheets API client wrapper
 * 
 * Provides low-level operations for interacting with Google Sheets API
 */
class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets | null = null;
  private initialized: boolean = false;
  private spreadsheetId: string | null = null;

  /**
   * Create a Google Sheets client with read permissions
   */
  private createSheetsClient(): sheets_v4.Sheets {
    if (!config.google.clientEmail || !config.google.privateKey) {
      throw new Error('Google Sheets credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    return google.sheets({ version: 'v4', auth });
  }

  /**
   * Initialize the sheets client and set spreadsheet ID
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!config.google.spreadsheetId) {
      throw new Error('Google Sheets spreadsheet ID not configured. Please set GOOGLE_SPREADSHEET_ID in .env');
    }

    this.sheets = this.createSheetsClient();
    this.spreadsheetId = config.google.spreadsheetId;
    this.initialized = true;
  }

  /**
   * Get the name of the first sheet in the spreadsheet
   */
  private async getFirstSheetName(): Promise<string> {
    await this.initialize();
    if (!this.sheets || !this.spreadsheetId) {
      throw new Error('Sheets client not initialized');
    }

    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheets = response.data.sheets;
    if (!sheets || sheets.length === 0) {
      throw new Error('No sheets found in spreadsheet');
    }

    return sheets[0].properties?.title ?? 'Sheet1';
  }

  /**
   * Read birthdays from Google Sheets
   * 
   * @param skipHeaderRow - Whether to skip the first row (default: true)
   * @returns Array of birthday records
   */
  async readBirthdays(
    skipHeaderRow: boolean = true
  ): Promise<BirthdayRecord[]> {
    await this.initialize();
    if (!this.sheets || !this.spreadsheetId) {
      throw new Error('Sheets client not initialized');
    }

    const sheetName = await this.getFirstSheetName();

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: sheetName,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    const startIndex = skipHeaderRow ? 1 : 0;
    const dataRows = rows.slice(startIndex);

    const birthdays: BirthdayRecord[] = [];
    for (const row of dataRows) {
      const rowBirthdays = this.parseRowToBirthdays(row);
      birthdays.push(...rowBirthdays);
    }

    return birthdays;
  }

  /**
   * Parse a row to extract multiple birthday records
   * A row can contain multiple name-date pairs (e.g., ["Name1", "Date1", "Name2", "Date2"])
   */
  private parseRowToBirthdays(row: string[]): BirthdayRecord[] {
    const birthdays: BirthdayRecord[] = [];
    for (let i = 0; i < row.length - 1; i++) {
      const name = row[i]?.trim();
      const dateStr = row[i + 1]?.trim();
      if (!name || !dateStr) {
        continue;
      }
      const birthday = parseDateString(dateStr);
      if (!birthday) {
        continue;
      }
      const nameParts = extractNameParts(name);
      const { firstName, lastName } = sanitizeNames(nameParts.firstName, nameParts.lastName);
      birthdays.push({ firstName, lastName, birthday });
      i++; // Skip the next cell
    }
    return birthdays;
  }
}

export default new GoogleSheetsClient();

