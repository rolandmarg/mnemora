import { extractNameParts, sanitizeNames } from './name-helpers.util.js';
import { parseDateString } from './date-helpers.util.js';
import type { BirthdayRecord } from '../types/birthday.types.js';

export function parseRowToBirthdays(row: string[]): BirthdayRecord[] {
  const birthdays: BirthdayRecord[] = [];
  for (let i = 0; i < row.length - 1; i += 2) {
    const name = row[i]?.trim();
    const dateStr = row[i + 1]?.trim();
    if (!name || !dateStr) continue;
    const birthday = parseDateString(dateStr);
    if (!birthday) continue;
    const nameParts = extractNameParts(name);
    const { firstName, lastName } = sanitizeNames(nameParts.firstName, nameParts.lastName);
    const record: BirthdayRecord = { firstName, birthday };
    if (lastName) record.lastName = lastName;
    birthdays.push(record);
  }
  return birthdays;
}

export function getDateRangeForBirthdays(birthdays: BirthdayRecord[]): { minDate: Date; maxDate: Date } | null {
  if (birthdays.length === 0) {
    return null;
  }
  
  let minDate = birthdays[0].birthday;
  let maxDate = birthdays[0].birthday;
  
  birthdays.forEach(birthday => {
    if (birthday.birthday < minDate) minDate = birthday.birthday;
    if (birthday.birthday > maxDate) maxDate = birthday.birthday;
  });
  
  return { minDate, maxDate };
}

