import { config } from '../../config.js';
import { startOfDay, endOfDay } from '../date.js';
import { getFullName } from '../name/name-helpers.js';
import type { CalendarEvent, CalendarClient } from './types.js';

/**
 * Calendar helper utilities
 */

export interface EventListOptions {
  calendarId?: string;
  startDate: Date;
  endDate: Date;
  maxResults?: number;
}

/**
 * Fetch events from calendar with common options
 */
export async function fetchEvents(
  calendar: CalendarClient,
  options: EventListOptions
): Promise<CalendarEvent[]> {
  const { startDate, endDate, calendarId, maxResults } = options;
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  const targetCalendarId = calendarId ?? config.google.calendarId;

  const response = await calendar.events.list({
    calendarId: targetCalendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    ...(maxResults && { maxResults }),
  });

  return response.data.items ?? [];
}

/**
 * Check if event name matches birthday input
 */
export function eventNameMatches(
  eventSummary: string,
  firstName: string,
  lastName?: string
): boolean {
  const summary = eventSummary.toLowerCase();
  const firstNameLower = firstName.toLowerCase();
  const lastNameLower = lastName?.toLowerCase() ?? '';
  const fullNameLower = getFullName(firstName, lastName).toLowerCase();

  return !!(
    summary.includes(firstNameLower) ||
    summary.includes(fullNameLower) ||
    (lastNameLower && summary.includes(lastNameLower))
  );
}

/**
 * Format duplicate event for display
 */
export function formatDuplicateEvent(
  event: CalendarEvent,
  index: number
): string {
  return `   ${index + 1}. ${event.summary ?? '(No title)'}\n      Event ID: ${event.id}\n      Date: ${event.start?.date ?? event.start?.dateTime ?? '(No date)'}`;
}

