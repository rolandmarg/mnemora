import { DataSourceFactory } from '../data-source/data-source.factory.js';
import { MetricsCollector, trackBirthdayFetch, trackApiCall, trackOperationDuration } from './metrics.service.js';
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
import { AlertingService } from './alerting.service.js';
import type { AppContext } from '../app-context.js';
import type { BirthdayRecord } from '../types/birthday.types.js';
import type { OutputChannel } from '../output-channel/output-channel.interface.js';
import type { WriteResult } from '../data-source/data-source.interface.js';

const BIRTHDAY_EMOJIS = ['🎂', '🎉', '🎈', '🎁', '🎊', '🥳', '🎀', '🎆', '🎇', '✨', '🌟', '💫', '🎪', '🎭', '🎨', '🎵', '🎶', '🎸', '🎹', '🎺', '🎻', '🥁', '🎤', '🎧', '🎬', '🎮', '🎯', '🎲', '🎰', '🎳'];

function getBirthdayEmoji(index: number): string {
  return BIRTHDAY_EMOJIS[index % BIRTHDAY_EMOJIS.length];
}

function getRandomEmoji(index: number): string {
  const randomIndex = (index * 7 + 13) % BIRTHDAY_EMOJIS.length;
  return BIRTHDAY_EMOJIS[randomIndex];
}

function getPersonalBirthdayMessage(name: string, index: number): string {
  const birthdayEmoji = getBirthdayEmoji(index);
  const randomEmoji = getRandomEmoji(index);
  return `${birthdayEmoji} ${randomEmoji} ${name}`;
}

class BirthdayService {
  private readonly calendarSource: ReturnType<typeof DataSourceFactory.createCalendarDataSource>;
  private readonly sheetsSource: ReturnType<typeof DataSourceFactory.createSheetsDataSource>;
  private readonly metrics: MetricsCollector;

  constructor(private readonly ctx: AppContext) {
    this.calendarSource = DataSourceFactory.createCalendarDataSource(ctx);
    this.sheetsSource = DataSourceFactory.createSheetsDataSource(ctx);
    this.metrics = new MetricsCollector(ctx);
  }

  async getTodaysBirthdays(): Promise<BirthdayRecord[]> {
    const startTime = Date.now();
    try {
      const todayDate = today();
      trackApiCall(this.metrics, 'calendar', true);
      const records = await this.calendarSource.read({ startDate: todayDate, endDate: todayDate });
      
      trackBirthdayFetch(this.metrics, records.length);
      trackOperationDuration(this.metrics, 'getTodaysBirthdays', Date.now() - startTime);
      
      return records;
    } catch (error) {
      trackApiCall(this.metrics, 'calendar', false);
      trackOperationDuration(this.metrics, 'getTodaysBirthdays', Date.now() - startTime, { success: 'false' });
      this.ctx.logger.error('Error getting today\'s birthdays', error);
      
      // Determine error type and send appropriate alert
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication') || errorMessage.includes('permission');
      const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
      const isNetworkError = errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network');
      
      const alerting = new AlertingService(this.ctx);
      if (isAuthError) {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'authentication',
          operation: 'getTodaysBirthdays',
        });
      } else if (isQuotaError) {
        alerting.sendApiQuotaWarningAlert('calendar', 100, {
          errorMessage,
          operation: 'getTodaysBirthdays',
        });
      } else if (isNetworkError) {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'network',
          operation: 'getTodaysBirthdays',
        });
      } else {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'unknown',
          operation: 'getTodaysBirthdays',
        });
      }
      
      throw error;
    }
  }

  async getTodaysBirthdaysWithOptionalDigest(): Promise<{
    todaysBirthdays: BirthdayRecord[];
    monthlyDigest?: string;
  }> {
    const todayDate = today();
    const isFirstDay = isFirstDayOfMonth(todayDate);

    if (isFirstDay) {
      const result = await this.getTodaysBirthdaysWithMonthlyDigest();
      return {
        todaysBirthdays: result.todaysBirthdays,
        monthlyDigest: result.monthlyDigest,
      };
    }

    const todaysBirthdays = await this.getTodaysBirthdays();
    return {
      todaysBirthdays,
    };
  }

  async getTodaysBirthdaysWithMonthlyDigest(): Promise<{
    todaysBirthdays: BirthdayRecord[];
    monthlyDigest: string;
  }> {
    const startTime = Date.now();
    try {
      const todayDate = today();
      const monthStart = startOfMonth(todayDate);
      const monthEnd = endOfMonth(todayDate);
      trackApiCall(this.metrics, 'calendar', true);
      const monthRecords = await this.calendarSource.read({ startDate: monthStart, endDate: monthEnd });
      
      const todayStart = startOfDay(todayDate);
      const todaysBirthdays = monthRecords.filter(record => {
        const recordStart = startOfDay(record.birthday);
        return recordStart.getTime() === todayStart.getTime();
      });

      const monthName = formatDateMonthYear(todayDate);
      
      if (monthRecords.length === 0) {
        return {
          todaysBirthdays: [],
          monthlyDigest: `📅 No birthdays scheduled for ${monthName}.`,
        };
      }

      const sortedRecords = [...monthRecords].sort((a, b) => 
        a.birthday.getTime() - b.birthday.getTime()
      );
      
      const birthdaysByDate = sortedRecords.reduce<Record<string, { name: string; randomEmoji: string }[]>>((acc, record, index) => {
        const dateKey = formatDateShort(record.birthday);
        const fullName = getFullName(record.firstName, record.lastName);
        const randomEmoji = getRandomEmoji(index);
        (acc[dateKey] ??= []).push({ name: fullName, randomEmoji });
        return acc;
      }, {});

      const sortedDates = Object.keys(birthdaysByDate);
      const maxDateWidth = Math.max(...sortedDates.map(date => `🎂 ${date}: `.length));

      const monthlyDigest = sortedDates.map(date => {
        const people = birthdaysByDate[date];
        const namesWithEmojis = people.map(p => `${p.name} ${p.randomEmoji}`).join(', ');
        const datePrefix = `🎂 ${date}: `;
        const paddedDatePrefix = datePrefix.padEnd(maxDateWidth);
        return `${paddedDatePrefix}${namesWithEmojis}`;
      }).join('\n');

      trackBirthdayFetch(this.metrics, monthRecords.length);
      trackOperationDuration(this.metrics, 'getTodaysBirthdaysWithMonthlyDigest', Date.now() - startTime);

      return {
        todaysBirthdays,
        monthlyDigest,
      };
    } catch (error) {
      trackApiCall(this.metrics, 'calendar', false);
      trackOperationDuration(this.metrics, 'getTodaysBirthdaysWithMonthlyDigest', Date.now() - startTime, { success: 'false' });
      this.ctx.logger.error('Error getting today\'s birthdays and monthly digest', error);
      
      // Determine error type and send appropriate alert
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication') || errorMessage.includes('permission');
      const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
      const isNetworkError = errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network');
      
      const alerting = new AlertingService(this.ctx);
      if (isAuthError) {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'authentication',
          operation: 'getTodaysBirthdaysWithMonthlyDigest',
        });
      } else if (isQuotaError) {
        alerting.sendApiQuotaWarningAlert('calendar', 100, {
          errorMessage,
          operation: 'getTodaysBirthdaysWithMonthlyDigest',
        });
      } else if (isNetworkError) {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'network',
          operation: 'getTodaysBirthdaysWithMonthlyDigest',
        });
      } else {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'unknown',
          operation: 'getTodaysBirthdaysWithMonthlyDigest',
        });
      }
      
      throw error;
    }
  }

  async getBirthdays(startDate: Date, endDate: Date): Promise<BirthdayRecord[]> {
    const startTime = Date.now();
    try {
      trackApiCall(this.metrics, 'calendar', true);
      const records = await this.calendarSource.read({ startDate, endDate });
      trackBirthdayFetch(this.metrics, records.length);
      trackOperationDuration(this.metrics, 'getBirthdays', Date.now() - startTime);
      return records;
    } catch (error) {
      trackApiCall(this.metrics, 'calendar', false);
      trackOperationDuration(this.metrics, 'getBirthdays', Date.now() - startTime, { success: 'false' });
      this.ctx.logger.error('Error getting birthdays', error);
      
      // Determine error type and send appropriate alert
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication') || errorMessage.includes('permission');
      const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
      const isNetworkError = errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network');
      
      const alerting = new AlertingService(this.ctx);
      if (isAuthError) {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'authentication',
          operation: 'getBirthdays',
        });
      } else if (isQuotaError) {
        alerting.sendApiQuotaWarningAlert('calendar', 100, {
          errorMessage,
          operation: 'getBirthdays',
        });
      } else if (isNetworkError) {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'network',
          operation: 'getBirthdays',
        });
      } else {
        alerting.sendGoogleCalendarApiFailedAlert(error, {
          errorType: 'unknown',
          operation: 'getBirthdays',
        });
      }
      
      throw error;
    }
  }

  async readFromSheets(): Promise<BirthdayRecord[]> {
    const startTime = Date.now();
    try {
      if (!this.sheetsSource.isAvailable()) {
        throw new Error('Google Sheets is not configured');
      }
      trackApiCall(this.metrics, 'sheets', true);
      const records = await this.sheetsSource.read({ skipHeaderRow: true });
      trackBirthdayFetch(this.metrics, records.length);
      trackOperationDuration(this.metrics, 'readFromSheets', Date.now() - startTime);
      return records;
    } catch (error) {
      trackApiCall(this.metrics, 'sheets', false);
      trackOperationDuration(this.metrics, 'readFromSheets', Date.now() - startTime, { success: 'false' });
      this.ctx.logger.error('Error reading from sheets', error);
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
      this.ctx.logger.error('Error syncing to calendar', error);
      throw error;
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
      this.ctx.logger.error('Error getting all birthdays for year', error);
      throw error;
    }
  }

  formatTodaysBirthdayMessages(birthdays: BirthdayRecord[]): string[] {
    if (birthdays.length === 0) {
      return [];
    }

    return birthdays.map((record, index) => {
      const fullName = getFullName(record.firstName, record.lastName);
      return getPersonalBirthdayMessage(fullName, index);
    });
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
      this.ctx.logger.error('Error formatting and sending birthdays', error);
      throw error;
    }
  }
}

export { BirthdayService };
