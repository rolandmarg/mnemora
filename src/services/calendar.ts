import { google } from 'googleapis';
import { config } from '../config.js';
import { fetchEvents, type EventListOptions } from '../utils/calendar/calendar-helpers.js';
import { startOfMonth, endOfMonth } from '../utils/date.js';
import type { CalendarEvent, CalendarClient, CalendarListEntry } from '../utils/calendar/types.js';

class CalendarService {
  private calendar: CalendarClient | null = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

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

  private async fetchEventsInternal(options: EventListOptions): Promise<CalendarEvent[]> {
    await this.initialize();
    if (!this.calendar) {
      throw new Error('Calendar client not initialized');
    }
    try {
      return await fetchEvents(this.calendar, options);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Fetch events for a specific date
   */
  async getEventsForDate(date: Date): Promise<CalendarEvent[]> {
    return this.fetchEventsInternal({ startDate: date, endDate: date });
  }

  /**
   * Get all events for a month
   */
  async getEventsForMonth(date: Date): Promise<CalendarEvent[]> {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    return this.fetchEventsInternal({ startDate: monthStart, endDate: monthEnd });
  }

  /**
   * Get all events for a date range
   */
  async getEventsForDateRange(startDate: Date, endDate: Date, calendarId?: string): Promise<CalendarEvent[]> {
    return this.fetchEventsInternal({ startDate, endDate, calendarId });
  }
  
  /**
   * Get all calendars available to the service account
   * @returns Array of calendar list entries
   */
  async getCalendars(): Promise<CalendarListEntry[]> {
    await this.initialize();
    if (!this.calendar) {
      throw new Error('Calendar client not initialized');
    }
    
    try {
      const response = await this.calendar.calendarList.list();
      return response.data.items ?? [];
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
      (cal.summary?.toLowerCase() ?? '').includes('birthday') ||
      (cal.id?.toLowerCase() ?? '').includes('birthday') ||
      cal.id?.includes('#contacts@group.v.calendar.google.com')
    );
    return birthdaysCalendar?.id ?? null;
  }

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
   * Check if an event is from the Birthdays calendar
   */
  isFromBirthdaysCalendar(event: CalendarEvent): boolean {
    return !!event.recurrence?.some(r => r.includes('YEARLY'));
  }

  /**
   * Extract person name from birthday event
   */
  extractName(event: CalendarEvent): string {
    const summary = event.summary ?? '';
    const patterns = [
      /^(.+?)(?:'s)?\s*(?:birthday|birth)/i,
      /birthday[:\s]+(.+)/i,
      /(.+?)\s+birthday/i,
    ];
    
    for (const pattern of patterns) {
      const match = summary.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return summary.trim();
  }
}

export default new CalendarService();

