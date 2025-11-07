import { google } from 'googleapis';
import { config } from '../config.js';
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from '../utils/date.js';
import type { CalendarEvent, CalendarClient } from '../utils/calendar/types.js';

export interface EventListOptions {
  startDate: Date;
  endDate: Date;
  maxResults?: number;
}

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

  /**
   * Fetch events from calendar with common options
   * Uses the service's internal calendar client
   */
  async fetchEvents(options: EventListOptions): Promise<CalendarEvent[]> {
    try {
      await this.initialize();
      if (!this.calendar) {
        throw new Error('Calendar client not initialized');
      }
      return await this.fetchEventsWithClient(this.calendar, options);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Fetch events from calendar with a specific calendar client
   * Useful when a different client (e.g., read-write) is needed
   */
  fetchEventsWithClient(calendar: CalendarClient, options: EventListOptions): Promise<CalendarEvent[]> {
    const { startDate, endDate, maxResults } = options;
    const start = startOfDay(startDate);
    const end = endOfDay(endDate); 

    return calendar.events.list({
      calendarId: config.google.calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      ...(maxResults && { maxResults }),
    }).then(response => response.data.items ?? []);
  }

  /**
   * Fetch events for a specific date
   */
  async getEventsForDate(date: Date): Promise<CalendarEvent[]> {
    return this.fetchEvents({ startDate: date, endDate: date });
  }

  /**
   * Get all events for a month
   */
  async getEventsForMonth(date: Date): Promise<CalendarEvent[]> {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    return this.fetchEvents({ startDate: monthStart, endDate: monthEnd });
  }

  /**
   * Get all events for a date range
   */
  async getEventsForDateRange(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
    return this.fetchEvents({ startDate, endDate });
  }
}

export default new CalendarService();

