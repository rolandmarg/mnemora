import { config } from '../config.js';
import calendarClient, { isBirthdayEvent, extractNameFromEvent } from '../clients/google-calendar.client.js';
import { formatDateISO, fromDate, today, formatDateShort, formatDateMonthYear, parseDateFromString, startOfDay, isFirstDayOfMonth, startOfMonth, endOfMonth } from '../utils/date.js';
import { getFullName } from '../utils/name-helpers.js';
import type { BirthdayRecord } from '../utils/birthday-helpers.js';
import type { Event } from '../utils/event-helpers.js';

interface BirthdaysByDate {
  [dateKey: string]: string[];
}

/**
 * Birthday service for managing birthday events
 */
class BirthdayService {

  /**
   * Get birthdays for today
   * @returns Array of birthday events for today
   */
  async getTodaysBirthdays(): Promise<Event[]> {
    try {
      const todayDate = today();
      const birthdays = (await calendarClient.fetchEvents({ startDate: todayDate, endDate: todayDate }))
        .filter(event => isBirthdayEvent(event));
      
      return birthdays;
    } catch (error) {
      console.error('Error getting today\'s birthdays:', error);
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
    todaysBirthdays: Event[];
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
    todaysBirthdays: Event[];
    monthlyDigest: string;
  }> {
    try {
      const todayDate = today();
      // Fetch entire month once
      const monthStart = startOfMonth(todayDate);
      const monthEnd = endOfMonth(todayDate);
      const monthBirthdays = (await calendarClient.fetchEvents({ startDate: monthStart, endDate: monthEnd }))
        .filter(event => isBirthdayEvent(event));
      
      // Filter for today's birthdays from the month data
      const todayStart = startOfDay(todayDate);
      const todaysBirthdays = monthBirthdays.filter(event => {
        const startDate = event.start?.date ?? event.start?.dateTime;
        if (!startDate) {
          return false;
        }
        try {
          const parsedDate = parseDateFromString(startDate);
          const eventStart = startOfDay(parsedDate);
          return eventStart.getTime() === todayStart.getTime();
        } catch {
          return false;
        }
      });

      // Generate monthly digest from month data
      const monthName = formatDateMonthYear(todayDate);
      
      if (monthBirthdays.length === 0) {
        return {
          todaysBirthdays: [],
          monthlyDigest: `📅 No birthdays scheduled for ${monthName}.`,
        };
      }

      // Group birthdays by date
      const birthdaysByDate = monthBirthdays.reduce((acc, event) => {
        const startDate = event.start?.date ?? event.start?.dateTime;
        if (!startDate) {
          return acc;
        }
        
        try {
          const parsedDate = parseDateFromString(startDate);
          const dateKey = formatDateShort(parsedDate);
          if (!acc[dateKey]) {
            acc[dateKey] = [];
          }
          acc[dateKey].push(extractNameFromEvent(event));
        } catch {
          // Skip events with invalid dates
          return acc;
        }
        return acc;
      }, {} as BirthdaysByDate);

      // Build message
      const sortedDates = Object.keys(birthdaysByDate).sort((a, b) => {
        try {
          const dateA = parseDateFromString(`${a}, ${todayDate.getFullYear()}`);
          const dateB = parseDateFromString(`${b}, ${todayDate.getFullYear()}`);
          return dateA.getTime() - dateB.getTime();
        } catch {
          // If date parsing fails, maintain original order
          return 0;
        }
      });

      const monthlyDigest = `📅 Upcoming Birthdays in ${monthName}:\n\n${ 
        sortedDates.map(date => `🎂 ${date}: ${birthdaysByDate[date].join(', ')}`).join('\n')}`;

      return {
        todaysBirthdays,
        monthlyDigest,
      };
    } catch (error) {
      console.error('Error getting today\'s birthdays and monthly digest:', error);
      throw error;
    }
  }

  /**
   * Check for duplicate birthday events
   */
  async checkForDuplicates(birthday: BirthdayRecord): Promise<Event[]> {
    try {
      const eventDate = fromDate(birthday.birthday);
      const events = await calendarClient.fetchEvents({
        startDate: eventDate,
        endDate: eventDate,
      });
      
      return events.filter(event => {
        const summary = (event.summary ?? '').toLowerCase();
        return summary.includes('birthday') && 
               calendarClient.eventNameMatches(event.summary ?? '', birthday.firstName, birthday.lastName);
      });
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return [];
    }
  }

  /**
   * Display duplicate events to the user
   */
  displayDuplicates(duplicates: Event[], fullName: string, date: Date): void {
    console.log('\n⚠️  Potential duplicate(s) found:');
    duplicates.forEach((dup, index) => console.log(calendarClient.formatDuplicateEvent(dup, index + 1)));
    console.log(`\n   Trying to add: ${fullName}'s Birthday`);
    console.log(`   Date: ${date.toLocaleDateString()}\n`);
  }

  /**
   * Add a birthday event to the calendar
   * Always checks for duplicates and skips them if found
   * @returns true if birthday was added, false if skipped due to duplicate
   */
  async addBirthday(birthday: BirthdayRecord): Promise<boolean> {
    const fullName = getFullName(birthday.firstName, birthday.lastName);
    
    const duplicates = await this.checkForDuplicates(birthday);
    if (duplicates.length > 0) {
      this.displayDuplicates(duplicates, fullName, fromDate(birthday.birthday));
      console.log(`⏭️  Skipping duplicate birthday for ${fullName}`);
      return false;
    }

    const dateString = formatDateISO(fromDate(birthday.birthday));
    const event: Event = {
      summary: `${fullName}'s Birthday`,
      description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
      start: { date: dateString, timeZone: 'UTC' },
      end: { date: dateString, timeZone: 'UTC' },
      recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
    };

    try {
      const response = await calendarClient.insertEvent(event);

      console.log('\n✅ Birthday event created successfully!');
      console.log(`   Title: ${event.summary}`);
      console.log(`   Date: ${dateString}`);
      console.log(`   Event ID: ${response.id}`);
      console.log(`   Calendar: ${config.google.calendarId}`);
      return true;
    } catch (error) {
      console.error('\n❌ Error creating birthday event:', error);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      throw error;
    }
  }
}

export default new BirthdayService();
