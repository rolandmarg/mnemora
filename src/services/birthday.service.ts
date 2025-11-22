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
import type { AlertingService } from './alerting.service.js';
import type { Logger } from '../types/logger.types.js';
import type { AppConfig } from '../config.js';
import type { BirthdayRecord } from '../types/birthday.types.js';
import type { OutputChannel } from '../output-channel/output-channel.interface.js';
import type { WriteResult } from '../data-source/data-source.interface.js';
import calendarClientDefault from '../clients/google-calendar.client.js';
import xrayClientDefault from '../clients/xray.client.js';
import cloudWatchMetricsClientDefault from '../clients/cloudwatch.client.js';
import sheetsClientDefault from '../clients/google-sheets.client.js';

type CalendarClient = typeof calendarClientDefault;
type XRayClient = typeof xrayClientDefault;

interface BirthdayServiceOptions {
  logger: Logger;
  config: AppConfig;
  calendarClient: CalendarClient;
  xrayClient: XRayClient;
  alerting: AlertingService;
}

const BIRTHDAY_EMOJIS = ['🎂', '🎉', '🎈', '🎁', '🎊', '🥳', '🎀', '🎆', '🎇', '✨', '🌟', '💫', '🎪', '🎭', '🎨', '🎵', '🎶', '🎸', '🎹', '🎺', '🎻', '🥁', '🎤', '🎧', '🎬', '🎮', '🎯', '🎲', '🎰', '🎳'];

function getRandomEmoji(_index: number): string {
  const randomIndex = Math.floor(Math.random() * BIRTHDAY_EMOJIS.length);
  return BIRTHDAY_EMOJIS[randomIndex];
}


class BirthdayService {
  private readonly logger: Logger;
  private readonly xrayClient: XRayClient;
  private readonly alerting: AlertingService;
  private readonly calendarSource: ReturnType<typeof DataSourceFactory.createCalendarDataSource>;
  private readonly sheetsSource: ReturnType<typeof DataSourceFactory.createSheetsDataSource>;
  private readonly metrics: MetricsCollector;

  constructor(options: BirthdayServiceOptions) {
    const { logger, config, calendarClient, xrayClient, alerting } = options;
    this.logger = logger;
    this.xrayClient = xrayClient;
    this.alerting = alerting;
    this.calendarSource = DataSourceFactory.createCalendarDataSource(config, calendarClient, logger);
    this.sheetsSource = DataSourceFactory.createSheetsDataSource(config, sheetsClientDefault, logger);
    this.metrics = new MetricsCollector({
      logger,
      config,
      cloudWatchClient: cloudWatchMetricsClientDefault,
      alerting,
    });
  }

  async getTodaysBirthdays(): Promise<BirthdayRecord[]> {
    return this.xrayClient.captureAsyncSegment('BirthdayService.getTodaysBirthdays', async () => {
      const startTime = Date.now();
      try {
        const todayDate = today();
        trackApiCall(this.metrics, 'calendar', true);
        const records = await this.calendarSource.read({ startDate: todayDate, endDate: todayDate });
        trackBirthdayFetch(this.metrics, records.length);
        trackOperationDuration(this.metrics, 'getTodaysBirthdays', Date.now() - startTime);
        
        return records;
      } catch (error) {
        const apiDuration = Date.now() - startTime;
        trackApiCall(this.metrics, 'calendar', false, apiDuration);
        trackOperationDuration(this.metrics, 'getTodaysBirthdays', Date.now() - startTime, { success: 'false' });
        this.logger.error('Error getting today\'s birthdays', error);
        
        // Determine error type and send appropriate alert
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication') || errorMessage.includes('permission');
        const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
        const isNetworkError = errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network');
        
        if (isAuthError) {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'authentication',
            operation: 'getTodaysBirthdays',
          });
        } else if (isQuotaError) {
          this.alerting.sendApiQuotaWarningAlert('calendar', 100, {
            errorMessage,
            operation: 'getTodaysBirthdays',
          });
        } else if (isNetworkError) {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'network',
            operation: 'getTodaysBirthdays',
          });
        } else {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'unknown',
            operation: 'getTodaysBirthdays',
          });
        }
        
        throw error;
      }
    }, {
      operation: 'getTodaysBirthdays',
    });
  }

  formatMonthlyDigest(monthlyBirthdays: BirthdayRecord[]): string {
    return this.xrayClient.captureSyncSegment('BirthdayService.formatMonthlyDigest', () => {
      if (monthlyBirthdays.length === 0) {
        const todayDate = today();
        const monthName = formatDateMonthYear(todayDate);
        return `📅 No birthdays scheduled for ${monthName}.`;
      }

      const sortedRecords = [...monthlyBirthdays].sort((a, b) => 
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

      return monthlyDigest;
    }, {
      birthdaysCount: monthlyBirthdays.length,
    });
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

      trackBirthdayFetch(this.metrics, monthRecords.length);
      trackOperationDuration(this.metrics, 'getTodaysBirthdaysWithMonthlyDigest', Date.now() - startTime);

      return {
        todaysBirthdays,
        monthlyBirthdays: monthRecords,
      };
    } catch (error) {
      trackApiCall(this.metrics, 'calendar', false);
      trackOperationDuration(this.metrics, 'getTodaysBirthdaysWithMonthlyDigest', Date.now() - startTime, { success: 'false' });
      this.logger.error('Error getting today\'s birthdays and monthly digest', error);
      
      // Determine error type and send appropriate alert
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication') || errorMessage.includes('permission');
      const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
      const isNetworkError = errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network');
      
        if (isAuthError) {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'authentication',
            operation: 'getTodaysBirthdaysWithMonthlyDigest',
          });
        } else if (isQuotaError) {
          this.alerting.sendApiQuotaWarningAlert('calendar', 100, {
            errorMessage,
            operation: 'getTodaysBirthdaysWithMonthlyDigest',
          });
        } else if (isNetworkError) {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'network',
            operation: 'getTodaysBirthdaysWithMonthlyDigest',
          });
        } else {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'unknown',
            operation: 'getTodaysBirthdaysWithMonthlyDigest',
          });
        }
      
      throw error;
    }
  }

  async getBirthdays(startDate: Date, endDate: Date): Promise<BirthdayRecord[]> {
    return this.xrayClient.captureAsyncSegment('BirthdayService.getBirthdays', async () => {
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
        this.logger.error('Error getting birthdays', error);
        
        // Determine error type and send appropriate alert
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('authentication') || errorMessage.includes('permission');
        const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
        const isNetworkError = errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network');
        
        if (isAuthError) {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'authentication',
            operation: 'getBirthdays',
          });
        } else if (isQuotaError) {
          this.alerting.sendApiQuotaWarningAlert('calendar', 100, {
            errorMessage,
            operation: 'getBirthdays',
          });
        } else if (isNetworkError) {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'network',
            operation: 'getBirthdays',
          });
        } else {
          this.alerting.sendGoogleCalendarApiFailedAlert(error, {
            errorType: 'unknown',
            operation: 'getBirthdays',
          });
        }
        
        throw error;
      }
    }, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
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
    return this.xrayClient.captureAsyncSegment('BirthdayService.trySyncFromSheets', async () => {
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
    }, {
      sheetsAvailable: this.sheetsSource.isAvailable(),
    });
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
    return this.xrayClient.captureSyncSegment('BirthdayService.formatTodaysBirthdayMessages', () => {
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
    }, {
      birthdaysCount: birthdays.length,
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
      this.logger.error('Error formatting and sending birthdays', error);
      throw error;
    }
  }
}

export { BirthdayService };
