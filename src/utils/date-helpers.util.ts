import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { config } from '../config.js';

function getTimezone(): string {
  return config.schedule.timezone;
}

function createDateInTimezone(year: number, month: number, day: number): Date {
  const tz = getTimezone();
  const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  return fromZonedTime(localDate, tz);
}

export function today(): Date {
  const tz = getTimezone();
  const now = new Date();
  const zonedDate = toZonedTime(now, tz);
  return new Date(zonedDate.getFullYear(), zonedDate.getMonth(), zonedDate.getDate());
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
