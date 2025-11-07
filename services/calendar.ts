import { google, calendar_v3 } from 'googleapis';
import { config } from '../config.js';

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

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const response = await this.calendar!.events.list({
        calendarId: config.google.calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
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

    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

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
   * Check if an event is a birthday
   * @param event - Calendar event object
   * @returns true if the event is a birthday
   */
  isBirthdayEvent(event: CalendarEvent): boolean {
    // Check if event is recurring (birthdays are usually recurring)
    // and has "birthday" in summary or description
    const summary = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    
    return (
      summary.includes('birthday') ||
      description.includes('birthday') ||
      (!!event.recurrence && summary.includes('birth'))
    );
  }

  /**
   * Extract person name from birthday event
   * @param event - Calendar event object
   * @returns Person's name
   */
  extractName(event: CalendarEvent): string {
    // Try to extract name from summary (e.g., "John's Birthday" -> "John")
    const summary = event.summary || '';
    const match = summary.match(/^(.+?)(?:'s)?\s*(?:birthday|birth)/i);
    return match ? match[1].trim() : summary.trim();
  }
}

export default new CalendarService();

