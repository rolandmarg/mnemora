import { DataSourceFactory } from '../factories/data-source.factory.js';
import { today, formatDateShort, formatDateMonthYear, startOfDay, isFirstDayOfMonth, startOfMonth, endOfMonth, startOfYear, endOfYear } from '../utils/date-helpers.js';
import { getFullName } from '../utils/name-helpers.js';
import { logger } from '../utils/logger.js';
import type { BirthdayRecord } from '../utils/birthday-helpers.js';
import type { OutputChannel } from '../interfaces/output-channel.interface.js';
import type { WriteResult } from '../interfaces/data-source.interface.js';

/**
 * Birthday emojis for variety
 */
const BIRTHDAY_EMOJIS = ['🎂', '🎉', '🎈', '🎁', '🎊', '🥳', '🎀', '🎆', '🎇', '✨', '🌟', '💫', '🎪', '🎭', '🎨', '🎵', '🎶', '🎸', '🎹', '🎺', '🎻', '🥁', '🎤', '🎧', '🎬', '🎮', '🎯', '🎲', '🎰', '🎳'];

/**
 * Get a birthday emoji
 */
function getBirthdayEmoji(index: number): string {
  return BIRTHDAY_EMOJIS[index % BIRTHDAY_EMOJIS.length];
}

/**
 * Get a random emoji (different from the birthday emoji)
 */
function getRandomEmoji(index: number): string {
  // Use a different offset to get variety
  const randomIndex = (index * 7 + 13) % BIRTHDAY_EMOJIS.length;
  return BIRTHDAY_EMOJIS[randomIndex];
}

/**
 * Get a short birthday message: birthday emoji + random emoji + name
 */
function getPersonalBirthdayMessage(name: string, index: number): string {
  const birthdayEmoji = getBirthdayEmoji(index);
  const randomEmoji = getRandomEmoji(index);
  return `${birthdayEmoji} ${randomEmoji} ${name}`;
}

/**
 * Birthday service for managing birthday events
 */
class BirthdayService {
  private readonly calendarSource = DataSourceFactory.createCalendarDataSource();
  private readonly sheetsSource = DataSourceFactory.createSheetsDataSource();

  /**
   * Get birthdays for today
   * @returns Array of birthday records for today
   */
  async getTodaysBirthdays(): Promise<BirthdayRecord[]> {
    try {
      const todayDate = today();
      const records = await this.calendarSource.read({ startDate: todayDate, endDate: todayDate });
      
      return records;
    } catch (error) {
      logger.error('Error getting today\'s birthdays', error);
      throw error;
    }
  }

  /**
   * Get birthdays for today with optional monthly digest
   * Automatically checks if it's the first day of month
   * On first day of month, returns monthly digest as well
   * On regular days, returns only today's birthdays
   * @returns Object with today's birthdays and optional monthly digest
   */
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

  /**
   * Get today's birthdays and monthly digest from a single optimized month fetch
   * Always returns both today's birthdays and monthly digest
   * Optimized for first day of month when both are needed
   * @returns Object with today's birthdays and monthly digest message
   */
  async getTodaysBirthdaysWithMonthlyDigest(): Promise<{
    todaysBirthdays: BirthdayRecord[];
    monthlyDigest: string;
  }> {
    try {
      const todayDate = today();
      // Fetch entire month once
      const monthStart = startOfMonth(todayDate);
      const monthEnd = endOfMonth(todayDate);
      const monthRecords = await this.calendarSource.read({ startDate: monthStart, endDate: monthEnd });
      
      // Filter for today's birthdays from the month data
      const todayStart = startOfDay(todayDate);
      const todaysBirthdays = monthRecords.filter(record => {
        const recordStart = startOfDay(record.birthday);
        return recordStart.getTime() === todayStart.getTime();
      });

      // Generate monthly digest from month data
      const monthName = formatDateMonthYear(todayDate);
      
      if (monthRecords.length === 0) {
        return {
          todaysBirthdays: [],
          monthlyDigest: `📅 No birthdays scheduled for ${monthName}.`,
        };
      }

      // Sort records by birthday date first, then group by formatted date
      const sortedRecords = [...monthRecords].sort((a, b) => 
        a.birthday.getTime() - b.birthday.getTime()
      );
      
      // Group sorted records by formatted date with emojis
      const birthdaysByDate = sortedRecords.reduce<Record<string, { name: string; randomEmoji: string }[]>>((acc, record, index) => {
        const dateKey = formatDateShort(record.birthday);
        const fullName = getFullName(record.firstName, record.lastName);
        const randomEmoji = getRandomEmoji(index);
        (acc[dateKey] ??= []).push({ name: fullName, randomEmoji });
        return acc;
      }, {});

      // Extract sorted dates (already sorted since records were sorted)
      const sortedDates = Object.keys(birthdaysByDate);

      // Calculate max width for date string (including emoji and colon) for alignment
      const maxDateWidth = Math.max(...sortedDates.map(date => `🎂 ${date}: `.length));

      // Format with newlines: birthday cake emoji before date, random emoji at end of name
      // Pad dates to align names
      const monthlyDigest = sortedDates.map(date => {
        const people = birthdaysByDate[date];
        const namesWithEmojis = people.map(p => `${p.name} ${p.randomEmoji}`).join(', ');
        const datePrefix = `🎂 ${date}: `;
        const paddedDatePrefix = datePrefix.padEnd(maxDateWidth);
        return `${paddedDatePrefix}${namesWithEmojis}`;
      }).join('\n');

      return {
        todaysBirthdays,
        monthlyDigest,
      };
    } catch (error) {
      logger.error('Error getting today\'s birthdays and monthly digest', error);
      throw error;
    }
  }

  /**
   * Get birthdays for a date range
   * @param startDate - Start date of the range
   * @param endDate - End date of the range
   * @returns Array of birthday records in the date range
   */
  async getBirthdays(startDate: Date, endDate: Date): Promise<BirthdayRecord[]> {
    try {
      return await this.calendarSource.read({ startDate, endDate });
    } catch (error) {
      logger.error('Error getting birthdays', error);
      throw error;
    }
  }

  /**
   * Delete all birthdays in bulk mode
   * @param startDate - Start date of the range
   * @param endDate - End date of the range
   * @returns Deletion result with counts
   */
  async deleteAllBirthdays(
    startDate: Date,
    endDate: Date
  ): Promise<{ deletedCount: number; skippedCount: number; errorCount: number }> {
    try {
      return await this.calendarSource.deleteAll({ startDate, endDate });
    } catch (error) {
      logger.error('Error deleting birthdays', error);
      throw error;
    }
  }

  /**
   * Read birthdays from Google Sheets
   * @returns Array of birthday records from sheets
   */
  async readFromSheets(): Promise<BirthdayRecord[]> {
    try {
      if (!this.sheetsSource.isAvailable()) {
        throw new Error('Google Sheets is not configured');
      }
      return await this.sheetsSource.read({ skipHeaderRow: true });
    } catch (error) {
      logger.error('Error reading from sheets', error);
      throw error;
    }
  }

  /**
   * Sync birthdays to Google Calendar
   * @param birthdays - Array of birthday records to sync
   * @returns Write result with counts of added, skipped, and errors
   */
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
      logger.error('Error syncing to calendar', error);
      throw error;
    }
  }

  /**
   * Get all birthdays for a year
   * @param year - Year to get birthdays for (defaults to current year)
   * @returns Array of birthday records for the year
   */
  async getAllBirthdaysForYear(year?: number): Promise<BirthdayRecord[]> {
    try {
      const todayDate = today();
      const targetYear = year ?? todayDate.getFullYear();
      const yearStart = startOfYear(new Date(targetYear, 0, 1));
      const yearEnd = endOfYear(new Date(targetYear, 0, 1));
      
      return await this.calendarSource.read({ startDate: yearStart, endDate: yearEnd });
    } catch (error) {
      logger.error('Error getting all birthdays for year', error);
      throw error;
    }
  }

  /**
   * Format today's birthday messages with personal congrats
   * @param birthdays - Array of birthday records for today
   * @returns Array of personalized birthday messages
   */
  formatTodaysBirthdayMessages(birthdays: BirthdayRecord[]): string[] {
    if (birthdays.length === 0) {
      return [];
    }

    return birthdays.map((record, index) => {
      const fullName = getFullName(record.firstName, record.lastName);
      return getPersonalBirthdayMessage(fullName, index);
    });
  }

  /**
   * Format and send all birthdays via output channel
   * Formats birthdays grouped by month and sends formatted messages
   * @param outputChannel - Output channel to send messages to
   * @param birthdays - Array of birthday records to format and send
   */
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

      // Sort records by birthday date first, then group by formatted date
      const sortedRecords = [...birthdays].sort((a, b) => 
        a.birthday.getTime() - b.birthday.getTime()
      );
      
      // Group sorted records by formatted date
      const birthdaysByDate = sortedRecords.reduce<Record<string, BirthdayRecord[]>>((acc, record) => {
        const dateKey = formatDateShort(record.birthday);
        (acc[dateKey] ??= []).push(record);
        return acc;
      }, {});
      
      // Extract sorted dates (already sorted since records were sorted)
      const sortedDates = Object.keys(birthdaysByDate);
      
      // Display results
      await outputChannel.send(`\n🎉 Found ${birthdays.length} birthday(s) in ${year}:\n`);
      
      // Group by month for better readability
      // Use the first record's birthday date to get month name (all records in group have same date)
      const birthdaysByMonth = sortedDates.reduce<Record<string, { date: string; records: BirthdayRecord[] }[]>>((acc, date) => {
        const records = birthdaysByDate[date];
        if (records.length === 0) return acc;
        
        // Use the first record's birthday to get month name (all records have same date)
        const monthName = records[0].birthday.toLocaleString('default', { month: 'long' });
        (acc[monthName] ??= []).push({ date, records });
        return acc;
      }, {});
      
      // Display by month
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      for (const monthName of monthNames) {
        if (birthdaysByMonth[monthName]) {
          await outputChannel.send(`\n📅 ${monthName}:`);
          for (const { date, records } of birthdaysByMonth[monthName]) {
            const names = records.map(r => r.lastName ? `${r.firstName} ${r.lastName}` : r.firstName);
            await outputChannel.send(`   🎂 ${date}: ${names.join(', ')}`);
          }
        }
      }
      
      await outputChannel.send('\n✅ Completed successfully!');
    } catch (error) {
      logger.error('Error formatting and sending birthdays', error);
      throw error;
    }
  }
}

export default new BirthdayService();
