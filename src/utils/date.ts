/**
 * Date utility functions
 */

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
 * Format a date as YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

