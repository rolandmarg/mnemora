import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../config.js';

dayjs.extend(utc);
dayjs.extend(timezone);

function getTimezone(): string {
  return config.schedule.timezone;
}

function createDateInTimezone(year: number, month: number, day: number): Date {
  const tz = getTimezone();
  // Create a date at midnight in the target timezone directly using dayjs
  // Parse the date string in the target timezone (not system timezone)
  // This prevents day shifts when converting between timezones
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // dayjs.tz(dateStr, tz) parses the date string as if it's in the target timezone
  // This ensures Nov 21 stays Nov 21 in the configured timezone
  return dayjs.tz(dateStr, tz).startOf('day').toDate();
}

export function today(): Date {
  const tz = getTimezone();
  const now = new Date();
  // toZonedTime equivalent: convert UTC now to timezone tz, get date components
  const zonedDate = dayjs(now).tz(tz);
  return new Date(zonedDate.year(), zonedDate.month(), zonedDate.date());
}

function createDate(month: number, day: number, year?: number): Date {
  const currentYear = year ?? today().getFullYear();
  return createDateInTimezone(currentYear, month, day);
}

function createDateFromMonthName(monthName: string, day: number, year?: number): Date | null {
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = monthNames.findIndex(m => m.startsWith(monthName.toLowerCase()));
  
  if (monthIndex === -1) {
    return null;
  }

  return createDate(monthIndex + 1, day, year);
}

export function parseDateFromString(dateString: string): Date {
  const dateOnlyMatch = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10);
    const day = parseInt(dateOnlyMatch[3], 10);
    return createDateInTimezone(year, month, day);
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: "${dateString}"`);
  }
  return date;
}

export function parseDateString(dateStr: string): Date | null {
  const trimmed = dateStr.trim();

  const abbreviatedMonthMatch = trimmed.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
  if (abbreviatedMonthMatch) {
    const monthName = abbreviatedMonthMatch[1];
    const day = parseInt(abbreviatedMonthMatch[2], 10);
    const date = createDateFromMonthName(monthName, day);
    if (date) {
      return date;
    }
  }

  const fullMonthMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (fullMonthMatch) {
    const monthName = fullMonthMatch[1];
    const day = parseInt(fullMonthMatch[2], 10);
    const year = fullMonthMatch[3] ? parseInt(fullMonthMatch[3], 10) : undefined;
    const date = createDateFromMonthName(monthName, day, year);
    if (date) {
      return date;
    }
  }

  const isoMatch = trimmed.match(/^(\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1] ? parseInt(isoMatch[1].replace('-', ''), 10) : undefined;
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    return createDate(month, day, year);
  }

  return null;
}

function normalizeDate(date: Date): Date {
  return new Date(date);
}

export function startOfDay(date: Date): Date {
  const normalized = normalizeDate(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function endOfDay(date: Date): Date {
  const normalized = normalizeDate(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

export function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function formatDateISO(date: Date): string {
  // Format using the configured timezone to get the correct calendar date
  // This ensures birthdays are formatted as the date they represent in the configured timezone
  const tz = getTimezone();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function formatDateShort(date: Date, includeYear: boolean = false): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };
  if (includeYear) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
}

export function formatDateMonthYear(date: Date): string {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function formatDateRange(startDate: Date, endDate: Date): string {
  return `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
}

export function isFirstDayOfMonth(date: Date): boolean {
  return date.getDate() === 1;
}

/**
 * Get the year of a date in the configured timezone.
 * This ensures we extract date components correctly regardless of system timezone.
 */
export function getYearInTimezone(date: Date): number {
  const tz = getTimezone();
  const zonedDate = dayjs(date).tz(tz);
  return zonedDate.year();
}

/**
 * Convert a date at midnight in the configured timezone to UTC.
 * This is used for querying APIs that expect UTC timestamps.
 * Example: Dec 4 00:00:00 PST -> Dec 4 08:00:00 UTC
 */
export function convertMidnightToUTC(date: Date): Date {
  const tz = getTimezone();
  // Get the date components in the configured timezone
  const zonedDate = dayjs(date).tz(tz);
  // Create a date string at midnight in the configured timezone
  const midnightInTz = zonedDate.startOf('day');
  // Convert to UTC
  return midnightInTz.utc().toDate();
}

/**
 * Get the month (1-12) of a date in the configured timezone.
 * This ensures we extract date components correctly regardless of system timezone.
 */
export function getMonthInTimezone(date: Date): number {
  const tz = getTimezone();
  const zonedDate = dayjs(date).tz(tz);
  return zonedDate.month() + 1; // dayjs months are 0-indexed, return 1-12
}

/**
 * Get the day of month (1-31) of a date in the configured timezone.
 * This ensures we extract date components correctly regardless of system timezone.
 */
export function getDateInTimezone(date: Date): number {
  const tz = getTimezone();
  const zonedDate = dayjs(date).tz(tz);
  return zonedDate.date(); // dayjs.date() returns 1-31
}

/**
 * Format a timestamp in a human-readable format in the configured timezone.
 * Example: "Nov 20, 2025 at 8:18 AM PST" or "Nov 20, 2025 at 9:18 AM PDT"
 */
export function formatTimestampHumanReadable(timestamp: string | Date): string {
  const tz = getTimezone();
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const zonedDate = dayjs(date).tz(tz);
  
  // Format: "Nov 20, 2025 at 8:18 AM PST"
  return zonedDate.format('MMM D, YYYY [at] h:mm A z');
}
