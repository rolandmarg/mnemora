import { google, type sheets_v4 } from 'googleapis';
import { config } from '../config.js';

class GoogleSheetsClient {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private cachedSheetName: string | null = null;

  constructor() {
    const clientEmail = config.google.clientEmail;
    const privateKey = config.google.privateKey;
    const spreadsheetId = config.google.spreadsheetId;
    
    if (!clientEmail || !privateKey) {
      throw new Error('Google Sheets credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    if (!spreadsheetId) {
      throw new Error('Google Sheets spreadsheet ID not configured. Please set GOOGLE_SPREADSHEET_ID in .env');
    }

    this.spreadsheetId = spreadsheetId;

    const auth = new google.auth.JWT(
      clientEmail,
      undefined,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  private async getFirstSheetName(): Promise<string> {
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

  async readRows(options?: {
    skipHeaderRow?: boolean;
    sheetName?: string;
  }): Promise<string[][]> {
    const sheetName = options?.sheetName ?? await this.getFirstSheetName();
    const skipHeaderRow = options?.skipHeaderRow ?? true;

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: sheetName,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    const startIndex = skipHeaderRow ? 1 : 0;
    return rows.slice(startIndex);
  }
}

export default new GoogleSheetsClient();

