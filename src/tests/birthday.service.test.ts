import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BirthdayService } from '../services/birthday.service.js';
import type { AppContext } from '../app-context.js';
import type { BirthdayRecord } from '../types/birthday.types.js';
import type { WriteResult } from '../data-source/data-source.interface.js';

describe('BirthdayService', () => {
  let mockAppContext: AppContext;
  let mockCalendarSource: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    isAvailable: ReturnType<typeof vi.fn>;
  };
  let mockSheetsSource: {
    read: ReturnType<typeof vi.fn>;
    isAvailable: ReturnType<typeof vi.fn>;
  };
  let birthdayService: BirthdayService;

  beforeEach(() => {
    // Mock calendar source
    mockCalendarSource = {
      read: vi.fn(),
      write: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true),
    };

    // Mock sheets source
    mockSheetsSource = {
      read: vi.fn(),
      isAvailable: vi.fn().mockReturnValue(true),
    };

    // Mock app context
    mockAppContext = {
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      config: {
        google: {
          calendarId: 'test-calendar-id',
          clientEmail: 'test@example.com',
          privateKey: 'test-key',
          spreadsheetId: undefined,
          projectId: undefined,
        },
        whatsapp: {
          groupId: undefined,
        },
        schedule: {
          time: '09:00',
          timezone: 'America/Los_Angeles',
        },
        aws: {
          region: 'us-west-1',
          s3Bucket: undefined,
          snsTopicArn: undefined,
          cloudWatchLogGroup: undefined,
          enableXRay: false,
        },
        metrics: {
          namespace: 'Test/Mnemora',
          enabled: false,
        },
        logging: {
          level: 'info',
          pretty: false,
        },
        environment: 'test',
      } as any,
      isLambda: false,
      environment: 'test',
      isProduction: false,
      clients: {
        calendar: {} as any,
        s3: {} as any,
        sns: {
          isAvailable: vi.fn().mockReturnValue(false),
        } as any,
        whatsapp: {} as any,
        cloudWatch: {} as any,
        sheets: {} as any,
      },
    };

    // Create BirthdayService with mocked data sources
    birthdayService = new BirthdayService(mockAppContext);
    
    // Replace data sources with mocks
    (birthdayService as any).calendarSource = mockCalendarSource as any;
    (birthdayService as any).sheetsSource = mockSheetsSource as any;
  });

  describe('syncToCalendar', () => {
    it('should sync birthdays to calendar successfully', async () => {
      const birthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      const writeResult: WriteResult = {
        added: 1,
        skipped: 0,
        errors: 0,
      };

      mockCalendarSource.write.mockResolvedValue(writeResult);

      const result = await birthdayService.syncToCalendar(birthdays);

      expect(result).toEqual(writeResult);
      expect(mockCalendarSource.write).toHaveBeenCalledWith(birthdays);
    });

    it('should throw error when calendar is not available', async () => {
      mockCalendarSource.isAvailable.mockReturnValue(false);

      const birthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      await expect(birthdayService.syncToCalendar(birthdays)).rejects.toThrow(
        'Google Calendar is not configured'
      );
    });

    it('should throw error when calendar source does not support writing', async () => {
      mockCalendarSource.write = undefined as any;

      const birthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      await expect(birthdayService.syncToCalendar(birthdays)).rejects.toThrow(
        'Calendar source does not support writing'
      );
    });

    it('should propagate errors from calendar write', async () => {
      const birthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      const writeError = new Error('Failed to write to calendar');
      mockCalendarSource.write.mockRejectedValue(writeError);

      await expect(birthdayService.syncToCalendar(birthdays)).rejects.toThrow(
        'Failed to write to calendar'
      );

      expect(mockAppContext.logger.error).toHaveBeenCalledWith(
        'Error syncing to calendar',
        writeError
      );
    });
  });

  describe('trySyncFromSheets', () => {
    it('should sync birthdays from sheets to calendar successfully', async () => {
      const sheetBirthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          birthday: new Date(1992, 6, 20),
        },
      ];

      const writeResult: WriteResult = {
        added: 2,
        skipped: 0,
        errors: 0,
      };

      mockSheetsSource.read.mockResolvedValue(sheetBirthdays);
      mockCalendarSource.write.mockResolvedValue(writeResult);

      await birthdayService.trySyncFromSheets();

      expect(mockSheetsSource.read).toHaveBeenCalledWith({ skipHeaderRow: true });
      expect(mockCalendarSource.write).toHaveBeenCalledWith(sheetBirthdays);
      expect(mockAppContext.logger.info).toHaveBeenCalledWith(
        'Successfully synced birthdays from Sheets to Calendar',
        expect.objectContaining({
          readFromSheets: 2,
          added: 2,
          skipped: 0,
          errors: 0,
        })
      );
    });

    it('should skip sync when sheets is not configured', async () => {
      mockSheetsSource.isAvailable.mockReturnValue(false);

      await birthdayService.trySyncFromSheets();

      expect(mockAppContext.logger.info).toHaveBeenCalledWith(
        'Sheets not configured, skipping sync'
      );
      expect(mockSheetsSource.read).not.toHaveBeenCalled();
      expect(mockCalendarSource.write).not.toHaveBeenCalled();
    });

    it('should skip sync when no birthdays found in sheets', async () => {
      mockSheetsSource.read.mockResolvedValue([]);

      await birthdayService.trySyncFromSheets();

      expect(mockAppContext.logger.warn).toHaveBeenCalledWith(
        'No birthdays found in Sheets - sync skipped (nothing to sync)'
      );
      expect(mockCalendarSource.write).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully and continue', async () => {
      const sheetBirthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      const syncError = new Error('Failed to sync to calendar');
      mockSheetsSource.read.mockResolvedValue(sheetBirthdays);
      mockCalendarSource.write.mockRejectedValue(syncError);

      // Should not throw - should log warning and continue
      await expect(birthdayService.trySyncFromSheets()).resolves.not.toThrow();

      expect(mockAppContext.logger.warn).toHaveBeenCalledWith(
        'Failed to sync from Sheets to Calendar',
        expect.objectContaining({
          error: 'Failed to sync to calendar',
        })
      );
    });

    it('should handle sheets read errors gracefully', async () => {
      const readError = new Error('Failed to read from sheets');
      mockSheetsSource.read.mockRejectedValue(readError);

      // Should not throw - should log warning and continue
      await expect(birthdayService.trySyncFromSheets()).resolves.not.toThrow();

      expect(mockAppContext.logger.warn).toHaveBeenCalledWith(
        'Failed to sync from Sheets to Calendar',
        expect.objectContaining({
          error: 'Failed to read from sheets',
        })
      );
    });

    it('should warn when sync completes but no birthdays were processed', async () => {
      const sheetBirthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      // Write result with all zeros (shouldn't happen, but test edge case)
      const writeResult: WriteResult = {
        added: 0,
        skipped: 0,
        errors: 0,
      };

      mockSheetsSource.read.mockResolvedValue(sheetBirthdays);
      mockCalendarSource.write.mockResolvedValue(writeResult);

      await birthdayService.trySyncFromSheets();

      expect(mockAppContext.logger.warn).toHaveBeenCalledWith(
        'Sync completed but no birthdays were processed - this should not happen if birthdays were read from Sheets',
        expect.objectContaining({
          readFromSheets: 1,
        })
      );
    });
  });

  describe('readFromSheets', () => {
    it('should read birthdays from sheets successfully', async () => {
      const sheetBirthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      mockSheetsSource.read.mockResolvedValue(sheetBirthdays);

      const result = await birthdayService.readFromSheets();

      expect(result).toEqual(sheetBirthdays);
      expect(mockSheetsSource.read).toHaveBeenCalledWith({ skipHeaderRow: true });
    });

    it('should throw error when sheets is not configured', async () => {
      mockSheetsSource.isAvailable.mockReturnValue(false);

      await expect(birthdayService.readFromSheets()).rejects.toThrow(
        'Google Sheets is not configured'
      );
    });

    it('should propagate errors from sheets read', async () => {
      const readError = new Error('Failed to read from sheets');
      mockSheetsSource.read.mockRejectedValue(readError);

      await expect(birthdayService.readFromSheets()).rejects.toThrow(
        'Failed to read from sheets'
      );
    });
  });

  describe('getTodaysBirthdays', () => {
    it('should get today\'s birthdays from calendar', async () => {
      const todayBirthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
      ];

      // Mock today's date
      const today = new Date(2025, 4, 15); // May 15, 2025
      vi.useFakeTimers();
      vi.setSystemTime(today);

      mockCalendarSource.read.mockResolvedValue(todayBirthdays);

      const result = await birthdayService.getTodaysBirthdays();

      expect(result).toEqual(todayBirthdays);
      expect(mockCalendarSource.read).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );

      vi.useRealTimers();
    });

    it('should handle errors when reading from calendar', async () => {
      const readError = new Error('Failed to read from calendar');
      mockCalendarSource.read.mockRejectedValue(readError);

      await expect(birthdayService.getTodaysBirthdays()).rejects.toThrow(
        'Failed to read from calendar'
      );
    });
  });

  describe('formatTodaysBirthdayMessages', () => {
    it('should format birthday messages', () => {
      const birthdays: BirthdayRecord[] = [
        {
          firstName: 'John',
          lastName: 'Doe',
          birthday: new Date(1990, 4, 15),
        },
        {
          firstName: 'Jane',
          birthday: new Date(1992, 6, 20),
        },
      ];

      const messages = birthdayService.formatTodaysBirthdayMessages(birthdays);

      expect(messages).toEqual([
        'Happy birthday John! 🎂',
        'Happy birthday Jane! 🎂',
      ]);
    });

    it('should return empty array when no birthdays', () => {
      const messages = birthdayService.formatTodaysBirthdayMessages([]);

      expect(messages).toEqual([]);
    });
  });
});

