import { google, type calendar_v3 } from 'googleapis';
import { auditDeletionAttempt, SecurityError } from '../utils/security.util.js';
import { startOfDay, endOfDay } from '../utils/date-helpers.util.js';
import { logger } from '../utils/logger.util.js';
import type { Event, DeletionResult } from '../types/event.types.js';
import { BaseClient, type XRayClientInterface } from './base.client.js';
import type { AppConfig } from '../config.js';

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

export interface EventListOptions {
  startDate: Date;
  endDate: Date;
  maxResults?: number;
}

class GoogleCalendarClient extends BaseClient {
  private _readOnlyCalendar: CalendarClient | null = null;
  private _readWriteCalendar: CalendarClient | null = null;
  private _calendarId: string | null = null;
  private _initialized = false;

  constructor(config: AppConfig, xrayClient: XRayClientInterface) {
    super(config, xrayClient);
  }

  private initialize(): void {
    if (this._initialized) {
      return;
    }

    const clientEmail = this.config.google.clientEmail;
    const privateKey = this.config.google.privateKey;
    const calendarId = this.config.google.calendarId;
    
    if (!clientEmail || !privateKey) {
      throw this.createError(
        'GoogleCalendar',
        'Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env'
      );
    }

    this._calendarId = calendarId;

    const readOnlyAuth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    this._readOnlyCalendar = google.calendar({ version: 'v3', auth: readOnlyAuth });

    const readWriteAuth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    this._readWriteCalendar = google.calendar({ version: 'v3', auth: readWriteAuth });

    this._initialized = true;
  }

  private get readOnlyCalendar(): CalendarClient {
    this.initialize();
    if (!this._readOnlyCalendar) {
      throw this.createError('GoogleCalendar', 'Read-only calendar client not initialized');
    }
    return this._readOnlyCalendar;
  }

  private get readWriteCalendar(): CalendarClient {
    this.initialize();
    if (!this._readWriteCalendar) {
      throw this.createError('GoogleCalendar', 'Read-write calendar client not initialized');
    }
    return this._readWriteCalendar;
  }

  async fetchEvents(options: EventListOptions): Promise<Event[]> {
    const { startDate, endDate, maxResults } = options;
    const calendarId = this._calendarId ?? this.config.google.calendarId;
    
    return this.captureSegment('GoogleCalendar', 'fetchEvents', async () => {
      const start = startOfDay(startDate);
      const end = endOfDay(endDate);
      
      // Extract local date components and create UTC date range
      // Query from start of target day to start of next day to catch all all-day events
      const startYear = start.getFullYear();
      const startMonth = start.getMonth();
      const startDay = start.getDate();
      const endYear = end.getFullYear();
      const endMonth = end.getMonth();
      const endDay = end.getDate();
      
      const timeMinUTC = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0));
      const timeMaxUTC = new Date(Date.UTC(endYear, endMonth, endDay + 1, 0, 0, 0, 0));

      try {
        const calendarEvents = await this.readOnlyCalendar.events.list({
          calendarId,
          timeMin: timeMinUTC.toISOString(),
          timeMax: timeMaxUTC.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          ...(maxResults && { maxResults }),
        }).then((response: { data: { items?: CalendarEvent[] | null } }) => {
          const items = response.data.items ?? [];
          logger.info(`Google Calendar API returned ${items.length} event(s)`, {
            timeMin: timeMinUTC.toISOString(),
            timeMax: timeMaxUTC.toISOString(),
            calendarId,
            sampleEvents: items.slice(0, 3).map((e: CalendarEvent) => ({
              summary: e.summary,
              start: e.start?.date ?? e.start?.dateTime,
              recurrence: e.recurrence,
            })),
          });
          return items;
        });

        // Filter events to only include those within the date range
        // For all-day events (date-only), check if the date is within the range
        // For timed events, they're already filtered by the API query
        const startDateStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
        const endDateStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
        
        const filteredEvents = calendarEvents.filter((event: CalendarEvent) => {
          if (event.start?.date) {
            // All-day event: check if the date is within the range (inclusive)
            const eventDate = event.start.date;
            return eventDate >= startDateStr && eventDate <= endDateStr;
          }
          // Timed event: already filtered by API query
          return true;
        });

        const result = filteredEvents.map(calendarEventToEvent);
        
        return result;
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }, {
      calendarId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      maxResults: maxResults ?? 'unlimited',
    });
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    const calendarId = this._calendarId ?? this.config.google.calendarId;
    return this.captureSegment('GoogleCalendar', 'deleteEvent', async () => {
      auditDeletionAttempt(logger, 'GoogleCalendarClient.deleteEvent', { eventId });
      throw new SecurityError('Deletion of calendar events is disabled for security reasons');
    }, {
      calendarId,
      eventId,
    });
  }

  async deleteAllEvents(events: Event[]): Promise<DeletionResult> {
    const calendarId = this._calendarId ?? this.config.google.calendarId;
    return this.captureSegment('GoogleCalendar', 'deleteAllEvents', async () => {
      auditDeletionAttempt(logger, 'GoogleCalendarClient.deleteAllEvents', {
        eventCount: events.length,
        eventIds: events.map(e => e.id).filter(Boolean),
      });
      throw new SecurityError('Deletion of calendar events is disabled for security reasons');
    }, {
      calendarId,
      eventCount: events.length,
    });
  }

  async insertEvent(event: Event): Promise<{ id: string }> {
    const calendarId = this._calendarId ?? this.config.google.calendarId;
    
    return this.captureSegment('GoogleCalendar', 'insertEvent', async () => {
      const calendarEvent = {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start,
        end: event.end,
        recurrence: event.recurrence,
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
      };

      try {
        const response = await this.readWriteCalendar.events.insert({
          calendarId,
          requestBody: calendarEvent,
        });

        if (!response.data.id) {
          throw this.createError('GoogleCalendar', 'Event created but no ID returned');
        }

        return { id: response.data.id };
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }, {
      calendarId,
      hasSummary: !!event.summary,
      hasRecurrence: !!event.recurrence,
    });
  }
}

export default GoogleCalendarClient;
