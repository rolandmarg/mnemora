import { sanitizeNames } from './name-sanitizer.js';
import { createDate, createDateFromMonthName } from './date.js';

/**
 * Shared birthday input parser
 */

export interface BirthdayInput {
  firstName: string;
  lastName?: string;
  birthday: Date;
  year?: number;
}

export function parseInput(input: string): BirthdayInput | null {
  // Try different formats:
  // 1. "John Doe 1990-05-15"
  // 2. "John Doe May 15, 1990"
  // 3. "John 1990-05-15"
  // 4. "John Doe 05-15"
  // 5. "John 05-15"
  
  const trimmed = input.trim();
  
  // Try ISO date format: YYYY-MM-DD or MM-DD
  const isoDateMatch = trimmed.match(/^(.+?)\s+(\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (isoDateMatch) {
    const namePart = isoDateMatch[1].trim();
    const year = isoDateMatch[2] ? parseInt(isoDateMatch[2].replace('-', '')) : undefined;
    const month = parseInt(isoDateMatch[3]);
    const day = parseInt(isoDateMatch[4]);
    
    const nameParts = namePart.split(/\s+/);
    const rawFirstName = nameParts[0];
    const rawLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
    
    const { firstName, lastName } = sanitizeNames(rawFirstName, rawLastName);
    
    const birthday = createDate(month, day, year);
    
    return { firstName, lastName, birthday, year };
  }
  
  // Try date format: "Name Month DD, YYYY" or "Name Month DD"
  const dateMatch = trimmed.match(/^(.+?)\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (dateMatch) {
    const namePart = dateMatch[1].trim();
    const monthName = dateMatch[2];
    const day = parseInt(dateMatch[3]);
    const year = dateMatch[4] ? parseInt(dateMatch[4]) : undefined;
    
    const nameParts = namePart.split(/\s+/);
    const rawFirstName = nameParts[0];
    const rawLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
    
    const { firstName, lastName } = sanitizeNames(rawFirstName, rawLastName);
    
    const birthday = createDateFromMonthName(monthName, day, year);
    
    if (!birthday) {
      return null;
    }
    
    return { firstName, lastName, birthday, year };
  }
  
  return null;
}

