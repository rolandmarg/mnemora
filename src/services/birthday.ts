import { config } from '../config.js';
import calendarService from './calendar.js';
import whatsappService from './whatsapp.js';
import { createReadWriteCalendarClient } from '../utils/calendar/calendar-auth.js';
import { formatDateISO, fromDate, today, formatDateShort, formatDateMonthYear, isFirstDayOfMonth as checkIsFirstDayOfMonth, parseDateFromString } from '../utils/date.js';
import { fetchEvents, eventNameMatches, formatDuplicateEvent } from '../utils/calendar/calendar-helpers.js';
import { getFullName } from '../utils/name/name-helpers.js';
import type { BirthdayInput } from '../utils/name/birthday-parser.js';
import type { CalendarEvent, CalendarClient } from '../utils/calendar/types.js';

interface BirthdaysByDate {
  [dateKey: string]: string[];
}

/**
 * Birthday service for managing birthday events and notifications
 */
class BirthdayService {
  /**
   * Check for birthdays today and send congratulations
   */
  async checkTodaysBirthdays(): Promise<void> {
    try {
      const todayDate = today();
      const birthdays = (await calendarService.getEventsForDate(todayDate))
        .filter(event => calendarService.isBirthdayEvent(event));
      
      if (birthdays.length === 0) {
        console.log('No birthdays today!');
        return;
      }

      const message = birthdays
        .map(event => `🎉 Happy Birthday ${calendarService.extractName(event)}! 🎂🎈`)
        .join('\n\n');
      
      await whatsappService.sendMessage(message);
      console.log(`Sent birthday wishes for ${birthdays.length} person(s)`);
    } catch (error) {
      console.error('Error checking today\'s birthdays:', error);
      throw error;
    }
  }

  /**
   * Generate and send monthly birthday digest
   */
  async sendMonthlyDigest(): Promise<void> {
    try {
      const todayDate = today();
      const birthdays = (await calendarService.getEventsForMonth(todayDate))
        .filter(event => calendarService.isBirthdayEvent(event));
      
      if (birthdays.length === 0) {
        const monthName = formatDateMonthYear(todayDate);
        await whatsappService.sendMessage(`📅 No birthdays scheduled for ${monthName}.`);
        return;
      }

      // Group birthdays by date
      const birthdaysByDate = birthdays.reduce((acc, event) => {
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
          acc[dateKey].push(calendarService.extractName(event));
        } catch {
          // Skip events with invalid dates
          return acc;
        }
        return acc;
      }, {} as BirthdaysByDate);

      // Build message
      const monthName = formatDateMonthYear(todayDate);
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

      const message = `📅 Upcoming Birthdays in ${monthName}:\n\n${ 
        sortedDates.map(date => `🎂 ${date}: ${birthdaysByDate[date].join(', ')}`).join('\n')}`;

      await whatsappService.sendMessage(message);
      console.log(`Sent monthly digest with ${birthdays.length} birthday(s)`);
    } catch (error) {
      console.error('Error sending monthly digest:', error);
      throw error;
    }
  }

  /**
   * Check if today is the first day of the month
   * @returns true if today is the first day of the month
   */
  isFirstDayOfMonth(): boolean {
    return checkIsFirstDayOfMonth(today());
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
      const events = await fetchEvents(calendar, {
        startDate: eventDate,
        endDate: eventDate,
      });
      
      return events.filter(event => {
        const summary = (event.summary ?? '').toLowerCase();
        return summary.includes('birthday') && 
               eventNameMatches(event.summary ?? '', birthday.firstName, birthday.lastName);
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
    duplicates.forEach((dup, index) => console.log(formatDuplicateEvent(dup, index + 1)));
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
