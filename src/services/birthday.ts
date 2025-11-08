import { DataSourceFactory } from '../factories/data-source.factory.js';
import { formatDateISO, fromDate, today, formatDateShort, formatDateMonthYear, startOfDay, isFirstDayOfMonth, startOfMonth, endOfMonth } from '../utils/date-helpers.js';
import { getFullName } from '../utils/name-helpers.js';
import { logger } from '../utils/logger.js';
import type { BirthdayRecord } from '../utils/birthday-helpers.js';

/**
 * Birthday service for managing birthday events
 */
class BirthdayService {
  private readonly calendarSource = DataSourceFactory.create('calendar');

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
      
      // Group sorted records by formatted date
      const birthdaysByDate = sortedRecords.reduce<Record<string, string[]>>((acc, record) => {
        const dateKey = formatDateShort(record.birthday);
        const fullName = getFullName(record.firstName, record.lastName);
        (acc[dateKey] ??= []).push(fullName);
        return acc;
      }, {});

      // Extract sorted dates (already sorted since records were sorted)
      const sortedDates = Object.keys(birthdaysByDate);

      const monthlyDigest = `📅 Upcoming Birthdays in ${monthName}:\n\n${ 
        sortedDates.map(date => `🎂 ${date}: ${birthdaysByDate[date].join(', ')}`).join('\n')}`;

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
   * Display duplicate events to the user
   */
  displayDuplicates(duplicates: BirthdayRecord[], fullName: string, date: Date): void {
    console.log('\n⚠️  Potential duplicate(s) found:');
    duplicates.forEach((dup, index) => {
      const duplicateName = getFullName(dup.firstName, dup.lastName);
      const duplicateDate = formatDateISO(fromDate(dup.birthday));
      console.log(`   ${index + 1}. ${duplicateName}'s Birthday`);
      console.log(`      Date: ${duplicateDate}`);
    });
    console.log(`\n   Trying to add: ${fullName}'s Birthday`);
    console.log(`   Date: ${date.toLocaleDateString()}\n`);
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
}

export default new BirthdayService();
