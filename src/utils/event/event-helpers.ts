import type { CalendarEvent } from '../../types/index.js';

/**
 * Event helper utilities
 */

/**
 * Check if event is recurring
 * Returns true if:
 * - Event has a recurrence rule (master recurring event)
 * - Event has a recurringEventId (instance of a recurring event)
 */
export function isRecurring(event: CalendarEvent): boolean {
  // Check if it's a master recurring event (has recurrence rules)
  if (event.recurrence && event.recurrence.length > 0) {
    return true;
  }
  
  // Check if it's an instance of a recurring event (has recurringEventId)
  if (event.recurringEventId) {
    return true;
  }
  
  return false;
}

/**
 * Check if event is all-day
 */
export function isAllDay(event: CalendarEvent): boolean {
  return !!event.start?.date && !event.start?.dateTime;
}

/**
 * Get event start date string
 */
export function getEventStartDate(event: CalendarEvent): string {
  return event.start?.date ?? event.start?.dateTime ?? '(No date)';
}

/**
 * Group events by predicate
 */
export function groupEvents(
  events: CalendarEvent[],
  predicates: Array<{ name: string; test: (event: CalendarEvent) => boolean }>
): Record<string, CalendarEvent[]> {
  const groups: Record<string, CalendarEvent[]> = {};
  
  predicates.forEach(({ name }) => {
    groups[name] = [];
  });

  events.forEach(event => {
    const matched = predicates.find(({ test }) => test(event));
    if (matched) {
      groups[matched.name].push(event);
    } else {
      groups.other = groups.other ?? [];
      groups.other.push(event);
    }
  });

  return groups;
}

