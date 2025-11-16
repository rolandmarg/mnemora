import type { Event } from '../types/event.types.js';

function isAllDay(event: Event): boolean {
  return !!event.start?.date && !event.start?.dateTime;
}

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

export function extractNameFromEvent(event: Event): string {
  const summary = event.summary ?? '';
  const patterns = [
    /^(.+?)(?:'s)?\s*(?:birthday|birth)/i,
    /birthday[:\s]+(.+)/i,
    /(.+?)\s+birthday/i,
  ];
  
  const match = patterns.map(p => summary.match(p)).find(m => m);
  return match ? match[1].trim() : summary.trim();
}
