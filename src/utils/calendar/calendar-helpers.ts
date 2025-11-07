import { getFullName } from '../name/name-helpers.js';
import type { CalendarEvent } from './types.js';

/**
 * Calendar helper utilities
 */

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

