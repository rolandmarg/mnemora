import { BirthdayService } from '../services/birthday.service.js';
import { appContext } from '../app-context.js';
import { today, startOfYear, endOfYear, formatDateISO } from '../utils/date-helpers.util.js';
import { getFullName } from '../utils/name-helpers.util.js';
import type { BirthdayRecord } from '../types/birthday.types.js';

interface BirthdayMatch {
  calendar: BirthdayRecord;
  sheets: BirthdayRecord;
}

interface ComparisonResult {
  calendarOnly: BirthdayRecord[];
  sheetsOnly: BirthdayRecord[];
  matched: BirthdayMatch[];
  totalCalendar: number;
  totalSheets: number;
}

function normalizeDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}-${day}`;
}

function normalizeName(firstName: string, lastName?: string): string {
  const normalized = `${firstName.toLowerCase().trim()}${lastName ? ` ${lastName.toLowerCase().trim()}` : ''}`;
  return normalized;
}

function birthdaysMatch(cal: BirthdayRecord, sheet: BirthdayRecord): boolean {
  const calDate = normalizeDate(cal.birthday);
  const sheetDate = normalizeDate(sheet.birthday);
  
  if (calDate !== sheetDate) {
    return false;
  }
  
  const calName = normalizeName(cal.firstName, cal.lastName);
  const sheetName = normalizeName(sheet.firstName, sheet.lastName);
  
  return calName === sheetName;
}

function compareBirthdays(
  calendarBirthdays: BirthdayRecord[],
  sheetsBirthdays: BirthdayRecord[]
): ComparisonResult {
  const matched: BirthdayMatch[] = [];
  const calendarOnly: BirthdayRecord[] = [];
  const sheetsOnly: BirthdayRecord[] = [...sheetsBirthdays];
  
  for (const calBirthday of calendarBirthdays) {
    const matchIndex = sheetsOnly.findIndex(sheetBirthday => 
      birthdaysMatch(calBirthday, sheetBirthday)
    );
    
    if (matchIndex >= 0) {
      matched.push({
        calendar: calBirthday,
        sheets: sheetsOnly[matchIndex],
      });
      sheetsOnly.splice(matchIndex, 1);
    } else {
      calendarOnly.push(calBirthday);
    }
  }
  
  return {
    calendarOnly,
    sheetsOnly,
    matched,
    totalCalendar: calendarBirthdays.length,
    totalSheets: sheetsBirthdays.length,
  };
}

async function checkCalendarSheetsSync(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);
  
  try {
    appContext.logger.info('Fetching birthdays from Google Calendar...');
    const todayDate = today();
    const year = todayDate.getFullYear();
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(new Date(year, 0, 1));
    
    const calendarBirthdays = await birthdayService.getBirthdays(yearStart, yearEnd);
    appContext.logger.info(`Found ${calendarBirthdays.length} birthday(s) in Google Calendar for ${year}`);
    
    appContext.logger.info('Fetching birthdays from Google Sheets...');
    const sheetsBirthdays = await birthdayService.readFromSheets();
    appContext.logger.info(`Found ${sheetsBirthdays.length} birthday(s) in Google Sheets`);
    
    appContext.logger.info('Comparing birthdays...');
    const comparison = compareBirthdays(calendarBirthdays, sheetsBirthdays);
    
    console.log('\n=== CALENDAR vs SHEETS COMPARISON ===\n');
    console.log(`Total in Calendar: ${comparison.totalCalendar}`);
    console.log(`Total in Sheets: ${comparison.totalSheets}`);
    console.log(`Matched: ${comparison.matched.length}`);
    console.log(`Calendar only (not in Sheets): ${comparison.calendarOnly.length}`);
    console.log(`Sheets only (not in Calendar): ${comparison.sheetsOnly.length}`);
    
    if (comparison.calendarOnly.length > 0) {
      console.log('\n⚠️  BIRTHDAYS IN CALENDAR BUT NOT IN SHEETS:');
      comparison.calendarOnly.forEach(birthday => {
        const name = getFullName(birthday.firstName, birthday.lastName);
        const date = formatDateISO(birthday.birthday);
        console.log(`  - ${name} (${date})`);
      });
    }
    
    if (comparison.sheetsOnly.length > 0) {
      console.log('\n⚠️  BIRTHDAYS IN SHEETS BUT NOT IN CALENDAR:');
      comparison.sheetsOnly.forEach(birthday => {
        const name = getFullName(birthday.firstName, birthday.lastName);
        const date = formatDateISO(birthday.birthday);
        console.log(`  - ${name} (${date})`);
      });
    }
    
    if (comparison.calendarOnly.length === 0 && comparison.sheetsOnly.length === 0) {
      console.log('\n✅ All calendar birthdays match sheets birthdays!');
    } else if (comparison.calendarOnly.length === 0) {
      console.log('\n✅ All calendar birthdays are from sheets (some sheets birthdays not yet synced to calendar)');
    } else {
      console.log('\n❌ Some calendar birthdays are NOT from sheets!');
    }
    
    appContext.logger.info('Comparison completed');
    process.exit(0);
  } catch (error) {
    appContext.logger.error('Error checking calendar-sheets sync', error);
    process.exit(1);
  }
}

checkCalendarSheetsSync();

