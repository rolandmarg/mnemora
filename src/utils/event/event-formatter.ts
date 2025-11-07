import type { CalendarEvent } from '../../types/index.js';

/**
 * Event formatting utilities
 */

/**
 * Format an event for display
 */
export function formatEvent(event: CalendarEvent): string {
  const summary = event.summary ?? '(No title)';
  const start = event.start?.date ?? event.start?.dateTime ?? '(No date)';
  const location = event.location ?? '';
  const description = event.description ? 
    (event.description.length > 100 ? `${event.description.substring(0, 100)  }...` : event.description) 
    : '';
  
  let formatted = `  Title: ${summary}`;
  formatted += `\n  Date: ${start}`;
  if (location) {
    formatted += `\n  Location: ${location}`;
  }
  if (description) {
    formatted += `\n  Description: ${description}`;
  }
  if (event.recurrence && event.recurrence.length > 0) {
    formatted += '\n  Recurring: Yes';
  }
  
  return formatted;
}

/**
 * Format event details for duplicate checking
 */
export function formatEventForDuplicate(event: CalendarEvent): string {
  return `${event.summary ?? '(No title)'} - ${event.start?.date ?? event.start?.dateTime ?? '(No date)'}`;
}

