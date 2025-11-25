import { sheets } from '@googleapis/sheets';
import type { sheets_v4 } from '@googleapis/sheets';
import { JWT } from 'google-auth-library';
import { config } from '../config.js';
import xrayClient from './xray.client.js';

class GoogleSheetsClient {
  private _sheets: sheets_v4.Sheets | null = null;
  private _spreadsheetId: string | null = null;
  private cachedSheetName: string | null = null;
  private _initialized = false;

  private initialize(): void {
    if (this._initialized) {
      return;
    }

    const clientEmail = config.google.clientEmail;
    const privateKey = config.google.privateKey;
    const spreadsheetId = config.google.spreadsheetId;
    
    if (!clientEmail || !privateKey) {
      throw new Error('Google Sheets credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    if (!spreadsheetId) {
      throw new Error('Google Sheets spreadsheet ID not configured. Please set GOOGLE_SPREADSHEET_ID in .env');
    }

    this._spreadsheetId = spreadsheetId;

    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    this._sheets = sheets({ version: 'v4' as const, auth: auth as any });

    this._initialized = true;
  }

  private get sheets(): sheets_v4.Sheets {
    this.initialize();
    if (!this._sheets) {
      throw new Error('Sheets client not initialized');
    }
    return this._sheets;
  }

  private get spreadsheetId(): string {
    this.initialize();
    if (!this._spreadsheetId) {
      throw new Error('Sheets client not initialized');
    }
    return this._spreadsheetId;
  }

  private async getFirstSheetName(): Promise<string> {
    if (this.cachedSheetName !== null) {
      return this.cachedSheetName;
    }

    return xrayClient.captureAsyncSegment('GoogleSheets.getFirstSheetName', async () => {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheets = response.data.sheets;
      if (!sheets || sheets.length === 0) {
        throw new Error('No sheets found in spreadsheet');
      }

      this.cachedSheetName = sheets[0]?.properties?.title ?? 'Sheet1';
      return this.cachedSheetName;
    }, {
      spreadsheetId: this.spreadsheetId,
    });
  }

  async readRows(options?: {
    skipHeaderRow?: boolean;
    sheetName?: string;
  }): Promise<string[][]> {
    return xrayClient.captureAsyncSegment('GoogleSheets.readRows', async () => {
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
      const result = rows.slice(startIndex);
      
      return result;
    }, {
      spreadsheetId: this.spreadsheetId,
      sheetName: options?.sheetName ?? 'auto-detect',
      skipHeaderRow: options?.skipHeaderRow ?? true,
    });
  }
}

// Lazy initialization: create instance but don't initialize until first use
// This allows handlers that don't need sheets (like daily-summary) to load without errors
export default new GoogleSheetsClient();

