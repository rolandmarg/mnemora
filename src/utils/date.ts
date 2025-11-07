/**
 * Date utility functions
 */

/**
 * Get today's date
 */
export function today(): Date {
  return new Date();
}

/**
 * Create a date from month (1-12) and day, optionally with year
 * If year is not provided, uses current year
 */
export function createDate(month: number, day: number, year?: number): Date {
  if (year !== undefined) {
    return new Date(year, month - 1, day);
  }
  const date = new Date();
  date.setMonth(month - 1, day);
  return date;
}

/**
 * Create a date from month name, day, and optionally year
 */
export function createDateFromMonthName(monthName: string, day: number, year?: number): Date | null {
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = monthNames.findIndex(m => m.startsWith(monthName.toLowerCase()));
  
  if (monthIndex === -1) {
    return null;
  }

  return createDate(monthIndex + 1, day, year);
}

/**
 * Parse a date from a string (ISO format or other common formats)
 * @throws Error if the date string cannot be parsed
 */
export function parseDateFromString(dateString: string): Date {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: "${dateString}"`);
  }
  return date;
}

/**
 * Normalize a date to the start of the day (00:00:00)
 */
export function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Normalize a date to the end of the day (23:59:59.999)
 */
export function endOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

/**
 * Get the start of the year for a given date
 */
export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

/**
 * Get the end of the year for a given date
 */
export function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/**
 * Get the start of the month for a given date
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get the end of the month for a given date
 */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date for display (e.g., "Jan 15" or "Jan 15, 2024")
 */
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

/**
 * Format a date for display with month name (e.g., "January 2024")
 */
export function formatDateMonthYear(date: Date): string {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

/**
 * Format a date range for display
 */
export function formatDateRange(startDate: Date, endDate: Date): string {
  return `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
}

/**
 * Get start and end of a date range
 */
export function getDateRange(startDate: Date, endDate: Date): { start: Date; end: Date } {
  return {
    start: startOfDay(startDate),
    end: endOfDay(endDate),
  };
}

/**
 * Check if a date is the first day of the month
 */
export function isFirstDayOfMonth(date: Date): boolean {
  return date.getDate() === 1;
}

/**
 * Get a date from a Date object (creates a new instance)
 */
export function fromDate(date: Date): Date {
  return new Date(date);
}
