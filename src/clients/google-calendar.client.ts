import { google, type calendar_v3 } from 'googleapis';
import { auditDeletionAttempt, SecurityError } from '../utils/security.util.js';
import { startOfDay, endOfDay } from '../utils/date-helpers.util.js';
import { appContext } from '../app-context.js';
import { config } from '../config.js';
import type { Event, DeletionResult } from '../types/event.types.js';

type CalendarClient = calendar_v3.Calendar;
type CalendarEvent = calendar_v3.Schema$Event;

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

class GoogleCalendarClient {
  private readonly readOnlyCalendar: CalendarClient;
  private readonly readWriteCalendar: CalendarClient;
  private readonly calendarId: string;

  constructor() {
    const clientEmail = config.google.clientEmail;
    const privateKey = config.google.privateKey;
    const calendarId = config.google.calendarId;
    
    if (!clientEmail || !privateKey) {
      throw new Error('Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    this.calendarId = calendarId;

    const readOnlyAuth = new google.auth.JWT(
      clientEmail,
      undefined,
      privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );
    this.readOnlyCalendar = google.calendar({ version: 'v3', auth: readOnlyAuth });

    const readWriteAuth = new google.auth.JWT(
      clientEmail,
      undefined,
      privateKey,
      ['https://www.googleapis.com/auth/calendar']
    );
    this.readWriteCalendar = google.calendar({ version: 'v3', auth: readWriteAuth });
  }

  async fetchEvents(options: EventListOptions): Promise<Event[]> {
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
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    auditDeletionAttempt(appContext, 'GoogleCalendarClient.deleteEvent', { eventId });
    throw new SecurityError('Deletion of calendar events is disabled for security reasons');
  }

  async deleteAllEvents(events: Event[]): Promise<DeletionResult> {
    auditDeletionAttempt(appContext, 'GoogleCalendarClient.deleteAllEvents', {
      eventCount: events.length,
      eventIds: events.map(e => e.id).filter(Boolean),
    });
    throw new SecurityError('Deletion of calendar events is disabled for security reasons');
  }

  async insertEvent(event: Event): Promise<{ id: string }> {
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
