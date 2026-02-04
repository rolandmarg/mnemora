import { DataSourceFactory } from '../data-source/data-source.factory.js';
import { getFullName } from '../utils/name-helpers.util.js';
import {
  today,
  formatDateShort,
  formatDateMonthYear,
  startOfDay,
  isFirstDayOfMonth,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from '../utils/date-helpers.util.js';
import type { Logger } from '../types/logger.types.js';
import type { AppConfig } from '../config.js';
import type { BirthdayRecord } from '../types/birthday.types.js';
import type { OutputChannel } from '../output-channel/output-channel.interface.js';
import type { WriteResult } from '../data-source/data-source.interface.js';
import GoogleCalendarClient from '../clients/google-calendar.client.js';
import sheetsClientDefault from '../clients/google-sheets.client.js';

type CalendarClient = GoogleCalendarClient;

interface BirthdayServiceOptions {
  logger: Logger;
  config: AppConfig;
  calendarClient: CalendarClient;
}

class BirthdayService {
  private readonly logger: Logger;
  private readonly calendarSource: ReturnType<typeof DataSourceFactory.createCalendarDataSource>;
  private readonly sheetsSource: ReturnType<typeof DataSourceFactory.createSheetsDataSource>;

  constructor(options: BirthdayServiceOptions) {
    const { logger, config, calendarClient } = options;
    this.logger = logger;
    this.calendarSource = DataSourceFactory.createCalendarDataSource(config, calendarClient, logger);
    this.sheetsSource = DataSourceFactory.createSheetsDataSource(config, sheetsClientDefault, logger);
  }

  async getTodaysBirthdays(): Promise<BirthdayRecord[]> {
    try {
      const todayDate = today();
      const records = await this.calendarSource.read({ startDate: todayDate, endDate: todayDate });

      return records;
    } catch (error) {
      this.logger.error('Error getting today\'s birthdays', error);
      throw error;
    }
  }

  formatMonthlyDigest(monthlyBirthdays: BirthdayRecord[]): string {
    if (monthlyBirthdays.length === 0) {
      const todayDate = today();
      const monthName = formatDateMonthYear(todayDate);
      return `📅 No birthdays scheduled for ${monthName}.`;
    }

    const sortedRecords = [...monthlyBirthdays].sort((a, b) =>
      a.birthday.getTime() - b.birthday.getTime()
    );

    const birthdaysByDate = sortedRecords.reduce<Record<string, { name: string }[]>>((acc, record) => {
      const dateKey = formatDateShort(record.birthday);
      const fullName = getFullName(record.firstName, record.lastName);
      (acc[dateKey] ??= []).push({ name: fullName });
      return acc;
    }, {});

    const sortedDates = Object.keys(birthdaysByDate);
    const maxDateWidth = Math.max(...sortedDates.map(date => `${date}: `.length));

    const monthlyDigest = sortedDates.map(date => {
      const people = birthdaysByDate[date];
      const names = people.map(p => p.name).join(', ');
      const datePrefix = `${date}: `;
      const paddedDatePrefix = datePrefix.padEnd(maxDateWidth);
      return `${paddedDatePrefix}${names}`;
    }).join('\n');

    return `Upcoming birthdays 🎂\n\n${monthlyDigest}`;
  }

  async getTodaysBirthdaysWithOptionalDigest(): Promise<{
    todaysBirthdays: BirthdayRecord[];
    monthlyBirthdays?: BirthdayRecord[];
  }> {
    const todayDate = today();
    const isFirstDay = isFirstDayOfMonth(todayDate);

    if (isFirstDay) {
      const result = await this.getTodaysBirthdaysWithMonthlyDigest();
      return {
        todaysBirthdays: result.todaysBirthdays,
        monthlyBirthdays: result.monthlyBirthdays,
      };
    }

    const todaysBirthdays = await this.getTodaysBirthdays();
    return {
      todaysBirthdays,
    };
  }

  async getTodaysBirthdaysWithMonthlyDigest(): Promise<{
    todaysBirthdays: BirthdayRecord[];
    monthlyBirthdays: BirthdayRecord[];
  }> {
    try {
      const todayDate = today();
      const monthStart = startOfMonth(todayDate);
      const monthEnd = endOfMonth(todayDate);
      const monthRecords = await this.calendarSource.read({ startDate: monthStart, endDate: monthEnd });

      const todayStart = startOfDay(todayDate);
      const todaysBirthdays = monthRecords.filter(record => {
        const recordStart = startOfDay(record.birthday);
        return recordStart.getTime() === todayStart.getTime();
      });

      return {
        todaysBirthdays,
        monthlyBirthdays: monthRecords,
      };
    } catch (error) {
      this.logger.error('Error getting today\'s birthdays and monthly digest', error);
      throw error;
    }
  }

  async getBirthdays(startDate: Date, endDate: Date): Promise<BirthdayRecord[]> {
    try {
      const records = await this.calendarSource.read({ startDate, endDate });
      return records;
    } catch (error) {
      this.logger.error('Error getting birthdays', error);
      throw error;
    }
  }

  async readFromSheets(): Promise<BirthdayRecord[]> {
    try {
      if (!this.sheetsSource.isAvailable()) {
        throw new Error('Google Sheets is not configured');
      }
      const records = await this.sheetsSource.read({ skipHeaderRow: true });
      return records;
    } catch (error) {
      this.logger.error('Error reading from sheets', error);
      throw error;
    }
  }

  async syncToCalendar(birthdays: BirthdayRecord[]): Promise<WriteResult> {
    try {
      if (!this.calendarSource.isAvailable()) {
        throw new Error('Google Calendar is not configured');
      }
      if (!this.calendarSource.write) {
        throw new Error('Calendar source does not support writing');
      }
      return await this.calendarSource.write(birthdays);
    } catch (error) {
      this.logger.error('Error syncing to calendar', error);
      throw error;
    }
  }

  async trySyncFromSheets(): Promise<void> {
    try {
      if (!this.sheetsSource.isAvailable()) {
        this.logger.info('Sheets not configured, skipping sync');
        return;
      }

      this.logger.info('Attempting to sync birthdays from Sheets to Calendar...');

      const sheetBirthdays = await this.readFromSheets();
      const writeResult = await this.syncToCalendar(sheetBirthdays);

      this.logger.info('Successfully synced birthdays from Sheets to Calendar', {
        added: writeResult.added,
        skipped: writeResult.skipped,
        errors: writeResult.errors,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to sync from Sheets to Calendar', {
        error: errorMessage,
      });
    }
  }

  async getAllBirthdaysForYear(year?: number): Promise<BirthdayRecord[]> {
    try {
      const todayDate = today();
      const targetYear = year ?? todayDate.getFullYear();
      const yearStart = startOfYear(new Date(targetYear, 0, 1));
      const yearEnd = endOfYear(new Date(targetYear, 0, 1));

      return await this.calendarSource.read({ startDate: yearStart, endDate: yearEnd });
    } catch (error) {
      this.logger.error('Error getting all birthdays for year', error);
      throw error;
    }
  }

  formatTodaysBirthdayMessages(birthdays: BirthdayRecord[]): string[] {
    if (birthdays.length === 0) {
      return [];
    }

    // Single birthday: return one message
    if (birthdays.length === 1) {
      const record = birthdays[0];
      return [`Happy birthday ${record.firstName}! 🎂`];
    }

    // Multiple birthdays: combine into a single message with proper grammar
    const names = birthdays.map(record => record.firstName);

    let combinedNames: string;
    if (names.length === 2) {
      // Two names: "Name1 and Name2"
      combinedNames = `${names[0]} and ${names[1]}`;
    } else {
      // Three or more names: "Name1, Name2, and Name3"
      const lastName = names[names.length - 1];
      const otherNames = names.slice(0, -1).join(', ');
      combinedNames = `${otherNames}, and ${lastName}`;
    }

    return [`Happy birthday ${combinedNames}! 🎂`];
  }

  async formatAndSendAllBirthdays(outputChannel: OutputChannel, birthdays: BirthdayRecord[]): Promise<void> {
    try {
      if (!outputChannel.isAvailable()) {
        throw new Error('Output channel is not available');
      }

      if (birthdays.length === 0) {
        const year = today().getFullYear();
        await outputChannel.send(`\n📅 No birthdays found for ${year}.\n`);
        return;
      }

      const year = birthdays[0]?.birthday ? new Date(birthdays[0].birthday).getFullYear() : today().getFullYear();

      const sortedRecords = [...birthdays].sort((a, b) =>
        a.birthday.getTime() - b.birthday.getTime()
      );

      const birthdaysByDate = sortedRecords.reduce<Record<string, BirthdayRecord[]>>((acc, record) => {
        const dateKey = formatDateShort(record.birthday);
        (acc[dateKey] ??= []).push(record);
        return acc;
      }, {});

      const sortedDates = Object.keys(birthdaysByDate);

      await outputChannel.send(`\n🎉 Found ${birthdays.length} birthday(s) in ${year}:\n`);

      const birthdaysByMonth = sortedDates.reduce<Record<string, { date: string; records: BirthdayRecord[] }[]>>((acc, date) => {
        const records = birthdaysByDate[date];
        if (records.length === 0) {
          return acc;
        }

        const monthName = records[0].birthday.toLocaleString('default', { month: 'long' });
        (acc[monthName] ??= []).push({ date, records });
        return acc;
      }, {});

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];

      await monthNames.reduce(async (promise, monthName) => {
        await promise;
        if (birthdaysByMonth[monthName]) {
          await outputChannel.send(`\n📅 ${monthName}:`);
          await birthdaysByMonth[monthName].reduce(async (promise, { date, records }) => {
            await promise;
            const names = records.map(r => r.lastName ? `${r.firstName} ${r.lastName}` : r.firstName);
            await outputChannel.send(`   🎂 ${date}: ${names.join(', ')}`);
          }, Promise.resolve());
        }
      }, Promise.resolve());

      await outputChannel.send('\n✅ Completed successfully!');
    } catch (error) {
      this.logger.error('Error formatting and sending birthdays', error);
      throw error;
    }
  }
}

export { BirthdayService };
