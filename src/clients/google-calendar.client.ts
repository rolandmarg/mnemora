import { google, type calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { startOfDay, endOfDay } from '../utils/date-helpers.js';
import { type Event, type DeletionResult } from '../utils/event-helpers.js';
import { logger } from '../utils/logger.js';

/**
 * Calendar client type
 */
type CalendarClient = calendar_v3.Calendar;

/**
 * Calendar event type - internal to calendar implementation
 * Only used within this client file
 */
type CalendarEvent = calendar_v3.Schema$Event;

/**
 * Convert CalendarEvent (Google Calendar API type) to Event (application type)
 */
function calendarEventToEvent(calendarEvent: CalendarEvent): Event {
  return {
    id: calendarEvent.id ?? undefined,
    summary: calendarEvent.summary ?? undefined,
    description: calendarEvent.description ?? undefined,
    location: calendarEvent.location ?? undefined,
    start: calendarEvent.start ? {
      date: calendarEvent.start.date ?? undefined,
      dateTime: calendarEvent.start.dateTime ?? undefined,
      timeZone: calendarEvent.start.timeZone ?? undefined,
    } : undefined,
    end: calendarEvent.end ? {
      date: calendarEvent.end.date ?? undefined,
      dateTime: calendarEvent.end.dateTime ?? undefined,
      timeZone: calendarEvent.end.timeZone ?? undefined,
    } : undefined,
    recurrence: calendarEvent.recurrence ?? undefined,
    recurringEventId: calendarEvent.recurringEventId ?? undefined,
  };
}

interface EventListOptions {
  startDate: Date;
  endDate: Date;
  maxResults?: number;
}

/**
 * Google Calendar API client wrapper
 * 
 * Provides low-level operations for interacting with Google Calendar API
 * 
 * The class maintains two separate clients:
 * - readOnlyCalendar: For read-only operations (fetching events)
 * - readWriteCalendar: For write operations (inserting, deleting events)
 */
class GoogleCalendarClient {
  // Read-only client for fetching events
  private readonly readOnlyCalendar: CalendarClient;

  // Read-write client for modifying events
  private readonly readWriteCalendar: CalendarClient;

  // Calendar ID - set during construction
  private readonly calendarId: string;

  /**
   * Constructor - validates configuration and initializes calendar clients
   */
  constructor() {
    // Validate credentials
    if (!config.google.clientEmail || !config.google.privateKey) {
      throw new Error('Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    // Validate and set calendar ID
    if (!config.google.calendarId) {
      throw new Error('Calendar ID not configured. Please set GOOGLE_CALENDAR_ID in .env');
    }

    this.calendarId = config.google.calendarId;

    // Initialize read-only calendar client
    const readOnlyAuth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );
    this.readOnlyCalendar = google.calendar({ version: 'v3', auth: readOnlyAuth });

    // Initialize read-write calendar client
    const readWriteAuth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar']
    );
    this.readWriteCalendar = google.calendar({ version: 'v3', auth: readWriteAuth });
  }

  // ============================================================================
  // READ-ONLY OPERATIONS
  // These methods use the read-only calendar client
  // ============================================================================

  /**
   * Fetch events from calendar with common options
   * Uses read-only calendar client (read-only scope)
   */
  async fetchEvents(options: EventListOptions): Promise<Event[]> {
    try {
      const { startDate, endDate, maxResults } = options;
      const start = startOfDay(startDate);
      const end = endOfDay(endDate); 

      const calendarEvents = await this.readOnlyCalendar.events.list({
        calendarId: this.calendarId,
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        ...(maxResults && { maxResults }),
      }).then(response => response.data.items ?? []);

      return calendarEvents.map(calendarEventToEvent);
    } catch (error) {
      logger.error('Error fetching calendar events', error);
      throw error;
    }
  }


  // ============================================================================
  // READ-WRITE OPERATIONS
  // ============================================================================

  /**
   * Delete a single event from the calendar
   * 
   * SECURITY: This method is disabled to prevent unauthorized deletion
   * 
   * @throws SecurityError - Always throws, deletion is disabled
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    const { auditDeletionAttempt, SecurityError } = await import('../utils/security.js');
    auditDeletionAttempt('GoogleCalendarClient.deleteEvent', { eventId });
    throw new SecurityError('Deletion of birthday events is disabled for security reasons');
  }

  /**
   * Delete all events in bulk mode
   * 
   * SECURITY: This method is disabled to prevent unauthorized deletion
   * 
   * @throws SecurityError - Always throws, deletion is disabled
   */
  async deleteAllEvents(events: Event[]): Promise<DeletionResult> {
    const { auditDeletionAttempt, SecurityError } = await import('../utils/security.js');
    auditDeletionAttempt('GoogleCalendarClient.deleteAllEvents', {
      eventCount: events.length,
      eventIds: events.map(e => e.id).filter(Boolean),
    });
    throw new SecurityError('Deletion of birthday events is disabled for security reasons');
  }

  /**
   * Insert a new event into the calendar
   * Uses read-write calendar client
   */
  async insertEvent(event: Event): Promise<{ id: string }> {
    // Convert Event to CalendarEvent for Google Calendar API
    const calendarEvent = {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      recurrence: event.recurrence,
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
    };

    const response = await this.readWriteCalendar.events.insert({
      calendarId: this.calendarId,
      requestBody: calendarEvent,
    });

    if (!response.data.id) {
      throw new Error('Event created but no ID returned');
    }

    return { id: response.data.id };
  }
}

const calendarClient = new GoogleCalendarClient();
export default calendarClient;
