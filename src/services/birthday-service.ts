import { config } from '../config.js';
import { createReadWriteCalendarClient } from '../utils/calendar/calendar-auth.js';
import { formatDateISO, fromDate } from '../utils/date.js';
import { fetchEvents, eventNameMatches, formatDuplicateEvent } from '../utils/calendar/calendar-helpers.js';
import { getFullName } from '../utils/name/name-helpers.js';
import type { BirthdayInput } from '../utils/name/birthday-parser.js';
import type { CalendarEvent, CalendarClient } from '../utils/calendar/types.js';

/**
 * Birthday service for managing birthday events in Google Calendar
 */

class BirthdayService {
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

