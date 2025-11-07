import { config } from '../config.js';
import calendarService from './calendar.js';
import { createReadWriteCalendarClient } from '../utils/event/calendar-auth.js';
import { formatDateISO, fromDate, today, formatDateShort, formatDateMonthYear, parseDateFromString, startOfDay, isFirstDayOfMonth } from '../utils/date.js';
import { getFullName, extractNameFromEvent } from '../utils/name/name-helpers.js';
import type { BirthdayInput } from '../utils/name/birthday-parser.js';
import type { CalendarEvent, CalendarClient } from '../types/index.js';

interface BirthdaysByDate {
  [dateKey: string]: string[];
}

/**
 * Birthday service for managing birthday events
 */
class BirthdayService {
  /**
   * Check if an event is a birthday
   */
  isBirthdayEvent(event: CalendarEvent): boolean {
    const summary = (event.summary ?? '').toLowerCase();
    const description = (event.description ?? '').toLowerCase();
    const hasBirthdayKeyword = summary.includes('birthday') || description.includes('birthday');
    
    if (hasBirthdayKeyword) {
      return true;
    }
    
    const hasYearlyRecurrence = event.recurrence?.some(r => r.includes('YEARLY') || r.includes('FREQ=YEARLY'));
    if (!hasYearlyRecurrence) {
      return false;
    }
    
    const isAllDay = event.start?.date && !event.start?.dateTime;
    if (isAllDay) {
      return true;
    }
    
    const excludedKeywords = ['meeting', 'reminder', 'appointment'];
    return summary.length > 0 && !excludedKeywords.some(keyword => summary.includes(keyword));
  }

  /**
   * Get birthdays for today
   * @returns Array of birthday events for today
   */
  async getTodaysBirthdays(): Promise<CalendarEvent[]> {
    try {
      const todayDate = today();
      const birthdays = (await calendarService.getEventsForDate(todayDate))
        .filter(event => this.isBirthdayEvent(event));
      
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
    todaysBirthdays: CalendarEvent[];
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
    todaysBirthdays: CalendarEvent[];
    monthlyDigest: string;
  }> {
    try {
      const todayDate = today();
      // Fetch entire month once
      const monthBirthdays = (await calendarService.getEventsForMonth(todayDate))
        .filter(event => this.isBirthdayEvent(event));
      
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
  async checkForDuplicates(
    calendar: CalendarClient,
    birthday: BirthdayInput
  ): Promise<CalendarEvent[]> {
    try {
      const eventDate = fromDate(birthday.birthday);
      const events = await calendarService.fetchEventsWithClient(calendar, {
        startDate: eventDate,
        endDate: eventDate,
      });
      
      return events.filter(event => {
        const summary = (event.summary ?? '').toLowerCase();
        return summary.includes('birthday') && 
               calendarService.eventNameMatches(event.summary ?? '', birthday.firstName, birthday.lastName);
      });
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return [];
    }
  }

  /**
   * Display duplicate events to the user
   */
  displayDuplicates(duplicates: CalendarEvent[], fullName: string, date: Date): void {
    console.log('\n⚠️  Potential duplicate(s) found:');
    duplicates.forEach((dup, index) => console.log(calendarService.formatDuplicateEvent(dup, index + 1)));
    console.log(`\n   Trying to add: ${fullName}'s Birthday`);
    console.log(`   Date: ${date.toLocaleDateString()}\n`);
  }

  /**
   * Add a birthday event to the calendar
   */
  async addBirthday(birthday: BirthdayInput, skipDuplicateCheck: boolean = false): Promise<void> {
    const calendar = createReadWriteCalendarClient();
    const fullName = getFullName(birthday.firstName, birthday.lastName);
    
    if (!skipDuplicateCheck) {
      const duplicates = await this.checkForDuplicates(calendar, birthday);
      if (duplicates.length > 0) {
        this.displayDuplicates(duplicates, fullName, fromDate(birthday.birthday));
        throw new Error('Duplicate birthday found');
      }
    }

    const dateString = formatDateISO(fromDate(birthday.birthday));
    const event: CalendarEvent = {
      summary: `${fullName}'s Birthday`,
      description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
      start: { date: dateString, timeZone: 'UTC' },
      end: { date: dateString, timeZone: 'UTC' },
      recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
    };

    try {
      const response = await calendar.events.insert({
        calendarId: config.google.calendarId,
        requestBody: event,
      });

      console.log('\n✅ Birthday event created successfully!');
      console.log(`   Title: ${event.summary}`);
      console.log(`   Date: ${dateString}`);
      console.log(`   Event ID: ${response.data.id}`);
      console.log(`   Calendar: ${config.google.calendarId}`);
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
