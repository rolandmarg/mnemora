import { calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { startOfDay, endOfDay } from './date.js';

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
  calendar: calendar_v3.Calendar,
  options: EventListOptions
): Promise<calendar_v3.Schema$Event[]> {
  const { startDate, endDate, calendarId, maxResults } = options;
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  const targetCalendarId = calendarId || config.google.calendarId;

  const response = await calendar.events.list({
    calendarId: targetCalendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    ...(maxResults && { maxResults }),
  });

  return response.data.items || [];
}

/**
 * Get full name from first and last name
 */
export function getFullName(firstName: string, lastName?: string): string {
  return lastName ? `${firstName} ${lastName}` : firstName;
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
  const lastNameLower = lastName?.toLowerCase() || '';
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
  event: calendar_v3.Schema$Event,
  index: number
): string {
  return `   ${index + 1}. ${event.summary || '(No title)'}\n      Event ID: ${event.id}\n      Date: ${event.start?.date || event.start?.dateTime || '(No date)'}`;
}

