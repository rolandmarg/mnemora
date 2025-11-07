import { google } from 'googleapis';
import { config } from '../config.js';
import { extractNameParts, sanitizeNames } from '../utils/name/name-helpers.js';
import { parseDateString } from '../utils/date.js';
import type { BirthdayInput } from '../utils/name/birthday-parser.js';
import type { sheets_v4 } from 'googleapis';

/**
 * Sheets service for reading data from Google Sheets
 */
class SheetsService {
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
   * Set the spreadsheet ID for all operations
   */
  setSpreadsheetId(spreadsheetId: string): void {
    this.spreadsheetId = spreadsheetId;
  }

  /**
   * Initialize the sheets client
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.sheets = this.createSheetsClient();
    // Set spreadsheet ID from config if not already set
    this.spreadsheetId ??= config.google.spreadsheetId ?? null;
    this.initialized = true;
  }

  /**
   * Parse a row from the spreadsheet into BirthdayInput array
   * 
   * Expected format:
   * - Name in one cell, date in adjacent cell
   * - A single row can contain multiple name-date pairs
   * - Empty cells are skipped
   * - Date formats: "Dec 9", "Nov 8", "Mar 16", "Feb 7" (abbreviated month + day)
   * - Also supports: "December 9", "May 15", "05-15", "1990-05-15"
   * 
   * Example row: ["", "", "Roland D", "Dec 2", "", "", "Tyler L", "June 1"]
   * Will parse: ["Roland D", "Dec 2"] and ["Tyler L", "June 1"]
   * 
   * @param row - Array of cell values from the spreadsheet row
   * @returns Array of BirthdayInput objects found in the row
   */
  private parseRowToBirthdays(row: string[]): BirthdayInput[] {
    const birthdays: BirthdayInput[] = [];

    // Iterate through the row looking for name-date pairs
    for (let i = 0; i < row.length - 1; i++) {
      const name = row[i]?.trim();
      const dateStr = row[i + 1]?.trim();

      // Skip if name or date is empty
      if (!name || !dateStr) {
        continue;
      }

      // Try to parse date in various formats
      const birthday = parseDateString(dateStr);
      if (!birthday) {
        // If date parsing fails, skip this pair
        continue;
      }

      // Parse and sanitize name
      const nameParts = extractNameParts(name);
      const { firstName, lastName } = sanitizeNames(nameParts.firstName, nameParts.lastName);

      birthdays.push({
        firstName,
        lastName,
        birthday,
      });

      // Skip the next cell since we've already used it as the date
      i++;
    }

    return birthdays;
  }

  /**
   * Get the first sheet name from the spreadsheet
   */
  private async getFirstSheetName(): Promise<string> {
    if (!this.sheets || !this.spreadsheetId) {
      throw new Error('Sheets client not initialized');
    }

    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheets = spreadsheet.data.sheets ?? [];
    if (sheets.length === 0) {
      throw new Error('No sheets found in spreadsheet');
    }

    return sheets[0].properties?.title ?? 'Sheet1';
  }

  /**
   * Read birthdays from Google Sheets spreadsheet
   * Reads from the entire first sheet
   * 
   * @param skipHeaderRow - Whether to skip the first row (default: true)
   * @returns Array of parsed BirthdayInput objects
   */
  async readBirthdays(
    skipHeaderRow: boolean = true
  ): Promise<BirthdayInput[]> {
    try {
      await this.initialize();
      
      if (!this.sheets) {
        throw new Error('Sheets client not initialized');
      }

      if (!this.spreadsheetId) {
        throw new Error('Spreadsheet ID not set. Call setSpreadsheetId() first or set GOOGLE_SPREADSHEET_ID in .env');
      }

      // Read from entire first sheet
      const sheetName = await this.getFirstSheetName();

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: sheetName,
      });

      const rows = response.data.values ?? [];
      
      if (rows.length === 0) {
        return [];
      }

      // Skip header row if requested
      const dataRows = skipHeaderRow ? rows.slice(1) : rows;
      
      const birthdays: BirthdayInput[] = [];
      
      for (const row of dataRows) {
        const rowBirthdays = this.parseRowToBirthdays(row);
        birthdays.push(...rowBirthdays);
      }

      return birthdays;
    } catch (error) {
      console.error('Error reading from Google Sheets:', error);
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      }
      throw error;
    }
  }
}

export default new SheetsService();

