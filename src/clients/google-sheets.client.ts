import { google, type sheets_v4 } from 'googleapis';
import { config } from '../config.js';
import { parseRowToBirthdays, type BirthdayRecord } from '../utils/birthday-helpers.js';

/**
 * Google Sheets API client wrapper
 * 
 * Provides low-level operations for interacting with Google Sheets API
 */
class GoogleSheetsClient {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private cachedSheetName: string | null = null;

  /**
   * Constructor - validates configuration and initializes sheets client
   */
  constructor() {
    // Validate credentials
    if (!config.google.clientEmail || !config.google.privateKey) {
      throw new Error('Google Sheets credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    // Validate and set spreadsheet ID
    if (!config.google.spreadsheetId) {
      throw new Error('Google Sheets spreadsheet ID not configured. Please set GOOGLE_SPREADSHEET_ID in .env');
    }

    this.spreadsheetId = config.google.spreadsheetId;

    // Initialize sheets client
    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * Get the name of the first sheet in the spreadsheet
   * Caches the result to avoid redundant API calls
   */
  private async getFirstSheetName(): Promise<string> {
    // Return cached value if available
    if (this.cachedSheetName !== null) {
      return this.cachedSheetName;
    }

    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheets = response.data.sheets;
    if (!sheets || sheets.length === 0) {
      throw new Error('No sheets found in spreadsheet');
    }

    this.cachedSheetName = sheets[0].properties?.title ?? 'Sheet1';
    return this.cachedSheetName;
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
      const rowBirthdays = parseRowToBirthdays(row);
      birthdays.push(...rowBirthdays);
    }

    return birthdays;
  }
}

export default new GoogleSheetsClient();

