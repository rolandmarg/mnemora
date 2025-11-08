import { extractNameParts, sanitizeNames } from './name-helpers.js';
import { parseDateString } from './date-helpers.js';

/**
 * Birthday record type
 */
export interface BirthdayRecord {
  firstName: string;
  lastName?: string;
  birthday: Date;
  year?: number;
}

/**
 * Birthday helper utilities
 */

/**
 * Parse a row to extract multiple birthday records
 * A row can contain multiple name-date pairs (e.g., ["Name1", "Date1", "Name2", "Date2"])
 * 
 * Loop processes pairs: (0,1), (2,3), (4,5), etc.
 * After processing each pair, increments i to skip the date cell we just processed
 */
export function parseRowToBirthdays(row: string[]): BirthdayRecord[] {
  const birthdays: BirthdayRecord[] = [];
  // Process name-date pairs: check pairs at (i, i+1), then skip to next pair
  for (let i = 0; i < row.length - 1; i++) {
    const name = row[i]?.trim();
    const dateStr = row[i + 1]?.trim();
    if (!name || !dateStr) {
      continue;
    }
    const birthday = parseDateString(dateStr);
    if (!birthday) {
      continue;
    }
    const nameParts = extractNameParts(name);
    const { firstName, lastName } = sanitizeNames(nameParts.firstName, nameParts.lastName);
    birthdays.push({ firstName, lastName, birthday });
    i++; // Skip the date cell we just processed, so next iteration is at i+2
  }
  return birthdays;
}

/**
 * Get the date range for a batch of birthdays
 * Returns min and max dates, or null if no birthdays provided
 * 
 * @param birthdays - Array of birthday records
 * @returns Object with minDate and maxDate, or null if empty array
 */
export function getDateRangeForBirthdays(birthdays: BirthdayRecord[]): { minDate: Date; maxDate: Date } | null {
  if (birthdays.length === 0) {
    return null;
  }
  
  let minDate = birthdays[0].birthday;
  let maxDate = birthdays[0].birthday;
  
  for (const birthday of birthdays) {
    if (birthday.birthday < minDate) {
      minDate = birthday.birthday;
    }
    if (birthday.birthday > maxDate) {
      maxDate = birthday.birthday;
    }
  }
  
  return { minDate, maxDate };
}

