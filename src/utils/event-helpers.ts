import { calendar_v3 } from 'googleapis';

/**
 * Event helper utilities
 */

/**
 * Check if event is recurring
 */
export function isRecurring(event: calendar_v3.Schema$Event): boolean {
  return !!event.recurrence && event.recurrence.length > 0;
}

/**
 * Check if event is all-day
 */
export function isAllDay(event: calendar_v3.Schema$Event): boolean {
  return !!event.start?.date && !event.start?.dateTime;
}

/**
 * Get event start date string
 */
export function getEventStartDate(event: calendar_v3.Schema$Event): string {
  return event.start?.date || event.start?.dateTime || '(No date)';
}

/**
 * Group events by predicate
 */
export function groupEvents(
  events: calendar_v3.Schema$Event[],
  predicates: Array<{ name: string; test: (event: calendar_v3.Schema$Event) => boolean }>
): Record<string, calendar_v3.Schema$Event[]> {
  const groups: Record<string, calendar_v3.Schema$Event[]> = {};
  
  predicates.forEach(({ name }) => {
    groups[name] = [];
  });

  events.forEach(event => {
    const matched = predicates.find(({ test }) => test(event));
    if (matched) {
      groups[matched.name].push(event);
    } else {
      groups.other = groups.other || [];
      groups.other.push(event);
    }
  });

  return groups;
}

