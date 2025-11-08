import { getFullName } from './name/name-helpers.js';

/**
 * Event type - application-level event representation
 * Not tied to any specific calendar provider
 */
export interface Event {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  recurrence?: string[];
  recurringEventId?: string;
}

/**
 * Event helper utilities
 */

/**
 * Check if event is recurring
 * Returns true if:
 * - Event has a recurrence rule (master recurring event)
 * - Event has a recurringEventId (instance of a recurring event)
 */
export function isRecurring(event: Event): boolean {
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
export function isAllDay(event: Event): boolean {
  return !!event.start?.date && !event.start?.dateTime;
}

/**
 * Get event start date string
 */
export function getEventStartDate(event: Event): string {
  return event.start?.date ?? event.start?.dateTime ?? '(No date)';
}

/**
 * Group events by predicate
 */
export function groupEvents(
  events: Event[],
  predicates: Array<{ name: string; test: (event: Event) => boolean }>
): Record<string, Event[]> {
  const groups: Record<string, Event[]> = {};
  
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

/**
 * Format an event for display
 */
export function formatEvent(event: Event): string {
  const summary = event.summary ?? '(No title)';
  const start = event.start?.date ?? event.start?.dateTime ?? '(No date)';
  const location = event.location ?? '';
  const description = event.description ? 
    (event.description.length > 100 ? `${event.description.substring(0, 100)}...` : event.description) 
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
export function formatEventForDuplicate(event: Event): string {
  return `${event.summary ?? '(No title)'} - ${event.start?.date ?? event.start?.dateTime ?? '(No date)'}`;
}

/**
 * Format duplicate event for display
 */
export function formatDuplicateEvent(event: Event, index: number): string {
  return `   ${index + 1}. ${event.summary ?? '(No title)'}\n      Event ID: ${event.id}\n      Date: ${event.start?.date ?? event.start?.dateTime ?? '(No date)'}`;
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
 * Check if an event is a birthday event
 */
export function isBirthdayEvent(event: Event): boolean {
  const summary = (event.summary ?? '').toLowerCase();
  const description = (event.description ?? '').toLowerCase();
  const hasBirthdayKeyword = summary.includes('birthday') || description.includes('birthday');
  
  if (hasBirthdayKeyword) {
    return true;
  }
  
  const hasYearlyRecurrence = event.recurrence?.some(r => r.includes('YEARLY') || r.includes('FREQ=YEARLY'));
  if (!hasYearlyRecurrence) {
    return false;
  }
  
  if (isAllDay(event)) {
    return true;
  }
  
  const excludedKeywords = ['meeting', 'reminder', 'appointment'];
  return summary.length > 0 && !excludedKeywords.some(keyword => summary.includes(keyword));
}

/**
 * Extract person name from birthday event
 */
export function extractNameFromEvent(event: Event): string {
  const summary = event.summary ?? '';
  const patterns = [
    /^(.+?)(?:'s)?\s*(?:birthday|birth)/i,
    /birthday[:\s]+(.+)/i,
    /(.+?)\s+birthday/i,
  ];
  
  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return summary.trim();
}

/**
 * Display deletion summary
 */
export interface DeletionResult {
  deletedCount: number;
  skippedCount: number;
  errorCount: number;
}

export function displayDeletionSummary(
  result: DeletionResult,
  totalEvents: number
): void {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY:');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total events reviewed: ${Math.min(result.deletedCount + result.skippedCount + result.errorCount, totalEvents)}`);
  console.log(`✅ Deleted: ${result.deletedCount}`);
  console.log(`⏭️  Skipped: ${result.skippedCount}`);
  console.log(`❌ Errors: ${result.errorCount}`);
  console.log('');
}
