import { google, calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { startOfDay, endOfDay } from '../utils/date.js';

type CalendarEvent = calendar_v3.Schema$Event;

class CalendarService {
  private calendar: calendar_v3.Calendar | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!config.google.clientEmail || !config.google.privateKey) {
      throw new Error('Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    this.calendar = google.calendar({ version: 'v3', auth });
    this.initialized = true;
  }

  /**
   * Fetch events for a specific date
   * @param date - The date to fetch events for
   * @returns Array of events
   */
  async getEventsForDate(date: Date): Promise<CalendarEvent[]> {
    await this.initialize();

    const start = startOfDay(date);
    const end = endOfDay(date);

    try {
      const response = await this.calendar!.events.list({
        calendarId: config.google.calendarId,
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Get all events for a month
   * @param date - Any date in the month
   * @returns Array of events for the month
   */
  async getEventsForMonth(date: Date): Promise<CalendarEvent[]> {
    await this.initialize();

    const startOfMonthDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonthDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const startOfMonth = startOfDay(startOfMonthDate);
    const endOfMonth = endOfDay(endOfMonthDate);

    try {
      const response = await this.calendar!.events.list({
        calendarId: config.google.calendarId,
        timeMin: startOfMonth.toISOString(),
        timeMax: endOfMonth.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Get all events for a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @param calendarId - Optional calendar ID (defaults to config)
   * @returns Array of events for the date range
   */
  async getEventsForDateRange(startDate: Date, endDate: Date, calendarId?: string): Promise<CalendarEvent[]> {
    await this.initialize();

    const { start, end } = { start: startOfDay(startDate), end: endOfDay(endDate) };
    const targetCalendarId = calendarId || config.google.calendarId;

    try {
      const response = await this.calendar!.events.list({
        calendarId: targetCalendarId,
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }
  
  /**
   * Get all calendars available to the service account
   * @returns Array of calendar list entries
   */
  async getCalendars(): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    await this.initialize();
    
    try {
      const response = await this.calendar!.calendarList.list();
      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendars:', error);
      throw error;
    }
  }
  
  /**
   * Find the Birthdays calendar ID
   * @returns Birthdays calendar ID or null if not found
   */
  async findBirthdaysCalendarId(): Promise<string | null> {
    const calendars = await this.getCalendars();
    const birthdaysCalendar = calendars.find(cal => 
      cal.summary?.toLowerCase().includes('birthday') ||
      cal.id?.toLowerCase().includes('birthday') ||
      cal.id?.includes('#contacts@group.v.calendar.google.com')
    );
    return birthdaysCalendar?.id || null;
  }

  /**
   * Check if an event is a birthday
   * @param event - Calendar event object
   * @returns true if the event is a birthday
   */
  isBirthdayEvent(event: CalendarEvent): boolean {
    // Check if event is recurring (birthdays are usually recurring)
    // and has "birthday" in summary or description
    const summary = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    
    // Google Calendar contact birthdays often have patterns like:
    // - "John's Birthday"
    // - "Birthday: John"
    // - Just the contact's name (when synced from Birthdays calendar)
    // - Recurring yearly events (YEARLY recurrence)
    
    // Check for explicit "birthday" in title or description
    if (summary.includes('birthday') || description.includes('birthday')) {
      return true;
    }
    
    // Check for recurring yearly events - these are likely birthdays from contacts
    // Contact birthdays sync from Birthdays calendar to main calendar as YEARLY recurring events
    if (event.recurrence && event.recurrence.length > 0) {
      const hasYearlyRecurrence = event.recurrence.some(r => 
        r.includes('YEARLY') || r.includes('FREQ=YEARLY')
      );
      
      // If it's a yearly recurring event, it's likely a birthday
      // Especially if it's an all-day event (birthdays are usually all-day)
      if (hasYearlyRecurrence) {
        // Additional check: birthdays are usually all-day events
        const isAllDay = event.start?.date && !event.start?.dateTime;
        if (isAllDay) {
          return true;
        }
        // Or if the summary doesn't look like a regular recurring event
        // (contact birthdays often just have the name, not "birthday" in the title)
        if (!summary.includes('meeting') && !summary.includes('reminder') && 
            !summary.includes('appointment') && summary.length > 0) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Check if an event is from the Birthdays calendar
   * Contact birthdays are usually in a special calendar
   * @param event - Calendar event object
   * @returns true if likely from Birthdays calendar
   */
  isFromBirthdaysCalendar(event: CalendarEvent): boolean {
    // Birthdays calendar events are usually:
    // - Recurring yearly events
    // - Have the contact name as the title
    // - Don't always have "birthday" in the title
    return !!event.recurrence && event.recurrence.length > 0 &&
           event.recurrence.some(r => r.includes('YEARLY'));
  }

  /**
   * Extract person name from birthday event
   * @param event - Calendar event object
   * @returns Person's name
   */
  extractName(event: CalendarEvent): string {
    const summary = event.summary || '';
    
    // Try different patterns:
    // 1. "John's Birthday" -> "John"
    // 2. "Birthday: John" -> "John"
    // 3. "John Birthday" -> "John"
    // 4. Just the name if it's from Birthdays calendar
    
    let match = summary.match(/^(.+?)(?:'s)?\s*(?:birthday|birth)/i);
    if (match) return match[1].trim();
    
    match = summary.match(/birthday[:\s]+(.+)/i);
    if (match) return match[1].trim();
    
    match = summary.match(/(.+?)\s+birthday/i);
    if (match) return match[1].trim();
    
    // If no pattern matches, return the summary as-is (might just be the name)
    return summary.trim();
  }
}

export default new CalendarService();

