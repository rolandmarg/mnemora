import { logger } from './logger.js';

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
 * Check if event is all-day
 */
export function isAllDay(event: Event): boolean {
  return !!event.start?.date && !event.start?.dateTime;
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
  logger.info('Deletion summary', {
    totalEventsReviewed: Math.min(result.deletedCount + result.skippedCount + result.errorCount, totalEvents),
    deleted: result.deletedCount,
    skipped: result.skippedCount,
    errors: result.errorCount,
  });
}
