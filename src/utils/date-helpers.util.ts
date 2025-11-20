import { config } from '../config.js';

function getTimezone(): string {
  return config.schedule.timezone;
}

function fromZonedTime(date: Date, timeZone: string): Date {
  // Get the date/time components as they appear in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
  
  // Create an ISO string representing this time
  const isoString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  
  // Create a date as if this ISO string were in UTC
  const utcCandidate = new Date(isoString + 'Z');
  
  // Now format that UTC candidate back to the target timezone to see what it actually represents
  const tzParts = formatter.formatToParts(utcCandidate);
  const tzYear = parseInt(tzParts.find(p => p.type === 'year')?.value || '0', 10);
  const tzMonth = parseInt(tzParts.find(p => p.type === 'month')?.value || '0', 10) - 1;
  const tzDay = parseInt(tzParts.find(p => p.type === 'day')?.value || '0', 10);
  const tzHour = parseInt(tzParts.find(p => p.type === 'hour')?.value || '0', 10);
  const tzMinute = parseInt(tzParts.find(p => p.type === 'minute')?.value || '0', 10);
  const tzSecond = parseInt(tzParts.find(p => p.type === 'second')?.value || '0', 10);
  
  // Calculate the offset: how much we need to adjust
  const tzDate = new Date(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
  const localDate = new Date(year, month, day, hour, minute, second);
  const offsetMs = localDate.getTime() - tzDate.getTime();
  
  // Apply the offset to get the correct UTC time
  // offsetMs is (what we want) - (what we got), so add it to adjust
  return new Date(utcCandidate.getTime() + offsetMs);
}


function toZonedTime(date: Date, timeZone: string): Date {
  // Format the UTC date as if it were in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
  
  // Create a date object with these components (treating them as if in the target timezone)
  // Then convert it back to UTC using fromZonedTime to ensure correct timezone handling
  const localDate = new Date(year, month, day, hour, minute, second);
  return fromZonedTime(localDate, timeZone);
}

function createDateInTimezone(year: number, month: number, day: number): Date {
  const tz = getTimezone();
  // Create a date at midnight in the target timezone
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
