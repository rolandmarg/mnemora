import { google, type calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { startOfDay, endOfDay } from '../utils/date.js';
import { 
  isBirthdayEvent, 
  extractNameFromEvent, 
  eventNameMatches as eventNameMatchesHelper, 
  formatDuplicateEvent as formatDuplicateEventHelper, 
  type Event, 
  type DeletionResult 
} from '../utils/event-helpers.js';

/**
 * Calendar client type
 */
export type CalendarClient = calendar_v3.Calendar;

/**
 * Calendar list entry type
 */
export type CalendarListEntry = calendar_v3.Schema$CalendarListEntry;

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

export interface EventListOptions {
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
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }


  // ============================================================================
  // UTILITY METHODS
  // These methods don't interact with the calendar API directly
  // ============================================================================

  /**
   * Check if event name matches birthday input
   * Delegates to event-helpers utility function
   */
  eventNameMatches(
    eventSummary: string,
    firstName: string,
    lastName?: string
  ): boolean {
    return eventNameMatchesHelper(eventSummary, firstName, lastName);
  }

  /**
   * Format duplicate event for display
   * Delegates to event-helpers utility function
   */
  formatDuplicateEvent(
    event: Event,
    index: number
  ): string {
    return formatDuplicateEventHelper(event, index);
  }

  // ============================================================================
  // READ-WRITE OPERATIONS
  // ============================================================================

  /**
   * Delete a single event from the calendar
   * Uses read-write calendar client
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await this.readWriteCalendar.events.delete({
        calendarId: this.calendarId,
        eventId,
      });
      return true;
    } catch (error) {
      console.error(`Error deleting event ${eventId}:`, error);
      return false;
    }
  }

  /**
   * Delete all events in bulk mode
   * Uses read-write calendar client
   */
  async deleteAllEvents(events: Event[]): Promise<DeletionResult> {
    const result: DeletionResult = {
      deletedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    };

    console.log('\nDeleting events...\n');

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventNumber = i + 1;
      const totalEvents = events.length;

      if (event.id) {
        const success = await this.deleteEvent(event.id);
        if (success) {
          console.log(`[${eventNumber}/${totalEvents}] ✅ Deleted: ${event.summary ?? 'Untitled Event'}`);
          result.deletedCount++;
        } else {
          console.log(`[${eventNumber}/${totalEvents}] ❌ Failed to delete: ${event.summary ?? 'Untitled Event'}`);
          result.errorCount++;
        }
      } else {
        console.log(`[${eventNumber}/${totalEvents}] ⚠️  Event has no ID, cannot delete: ${event.summary ?? 'Untitled Event'}`);
        result.errorCount++;
      }
    }

    return result;
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

// Re-export event helper functions for convenience
export { isBirthdayEvent, extractNameFromEvent, eventNameMatchesHelper as eventNameMatches, formatDuplicateEventHelper as formatDuplicateEvent };

const calendarClient = new GoogleCalendarClient();
export default calendarClient;
