import { extractNameParts, sanitizeNames, parseNameFromString } from './name-helpers.js';
import { createDate, createDateFromMonthName, parseDateString } from './date-helpers.js';

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
 * Extract name and ISO date components from a combined string
 * Parses formats like "John Doe 1990-05-15" or "John Doe 05-15"
 * Returns match result with name part and date components, or null if format doesn't match
 */
function extractNameAndISODateComponents(input: string): { namePart: string; month: number; day: number; year?: number } | null {
  const isoDateMatch = input.match(/^(.+?)\s+(\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  
  if (!isoDateMatch) {
    return null;
  }
  
  const namePart = isoDateMatch[1].trim();
  const year = isoDateMatch[2] ? parseInt(isoDateMatch[2].replace('-', ''), 10) : undefined;
  const month = parseInt(isoDateMatch[3], 10);
  const day = parseInt(isoDateMatch[4], 10);
  
  return { namePart, month, day, year };
}

/**
 * Extract name and month name date components from a combined string
 * Parses formats like "John Doe May 15, 1990" or "John Doe May 15"
 * Returns match result with name part and date components, or null if format doesn't match
 */
function extractNameAndMonthNameDateComponents(input: string): { namePart: string; monthName: string; day: number; year?: number } | null {
  const dateMatch = input.match(/^(.+?)\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  
  if (!dateMatch) {
    return null;
  }
  
  const namePart = dateMatch[1].trim();
  const monthName = dateMatch[2];
  const day = parseInt(dateMatch[3], 10);
  const year = dateMatch[4] ? parseInt(dateMatch[4], 10) : undefined;
  
  return { namePart, monthName, day, year };
}

/**
 * Try to parse input as ISO date format (YYYY-MM-DD or MM-DD)
 * Returns BirthdayRecord if successful, null otherwise
 */
function tryParseISODateFormat(input: string): BirthdayRecord | null {
  const matchResult = extractNameAndISODateComponents(input);
  
  if (!matchResult) {
    return null;
  }
  
  const { firstName, lastName } = parseNameFromString(matchResult.namePart);
  const birthday = createDate(matchResult.month, matchResult.day, matchResult.year);
  
  return {
    firstName,
    lastName,
    birthday,
    year: matchResult.year,
  };
}

/**
 * Try to parse input as month name date format (Month DD, YYYY or Month DD)
 * Returns BirthdayRecord if successful, null otherwise
 */
function tryParseMonthNameDateFormat(input: string): BirthdayRecord | null {
  const matchResult = extractNameAndMonthNameDateComponents(input);
  
  if (!matchResult) {
    return null;
  }
  
  const { firstName, lastName } = parseNameFromString(matchResult.namePart);
  const birthday = createDateFromMonthName(matchResult.monthName, matchResult.day, matchResult.year);
  
  if (!birthday) {
    return null;
  }
  
  return {
    firstName,
    lastName,
    birthday,
    year: matchResult.year,
  };
}

/**
 * Parse birthday input string into structured BirthdayRecord
 * 
 * Supports multiple formats:
 * - "John Doe 1990-05-15" (ISO with year)
 * - "John Doe 05-15" (ISO without year)
 * - "John Doe May 15, 1990" (Month name with year)
 * - "John Doe May 15" (Month name without year)
 * 
 * @param input - Input string containing name and date
 * @returns BirthdayRecord if parsing succeeds, null otherwise
 */
export function parseInput(input: string): BirthdayRecord | null {
  const trimmed = input.trim();
  
  // Try ISO date format first (YYYY-MM-DD or MM-DD)
  const isoResult = tryParseISODateFormat(trimmed);
  if (isoResult) {
    return isoResult;
  }
  
  // Try month name date format (Month DD, YYYY or Month DD)
  const monthNameResult = tryParseMonthNameDateFormat(trimmed);
  if (monthNameResult) {
    return monthNameResult;
  }
  
  return null;
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

