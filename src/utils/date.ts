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
 * Parse a date string into a Date object
 * Supports formats:
 * - "Dec 9", "Nov 8", "Mar 16" (abbreviated month + day)
 * - "December 9", "May 15" (full month name + day)
 * - "05-15" (MM-DD)
 * - "1990-05-15" (YYYY-MM-DD)
 * - "May 15, 1990" (Month DD, YYYY)
 * 
 * @param dateStr - Date string to parse
 * @returns Date object if parsing succeeds, null otherwise
 */
export function parseDateString(dateStr: string): Date | null {
  const trimmed = dateStr.trim();

  // Try abbreviated month format: "Dec 9", "Nov 8", "Mar 16"
  const abbreviatedMonthMatch = trimmed.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
  if (abbreviatedMonthMatch) {
    const monthName = abbreviatedMonthMatch[1];
    const day = parseInt(abbreviatedMonthMatch[2], 10);
    const date = createDateFromMonthName(monthName, day);
    if (date) {
      return date;
    }
  }

  // Try full month name format: "December 9", "May 15"
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

  // Try ISO format: "1990-05-15" or "05-15"
  const isoMatch = trimmed.match(/^(\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1] ? parseInt(isoMatch[1].replace('-', ''), 10) : undefined;
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    return createDate(month, day, year);
  }

  return null;
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
