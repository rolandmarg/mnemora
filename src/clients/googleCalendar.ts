import { google, type calendar_v3 } from 'googleapis';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../config.js';
import {
  parseDateFromString,
  today,
  formatDateISO,
  startOfYear,
  endOfYear,
  getYearInTimezone,
  getMonthInTimezone,
  getDateInTimezone,
  convertMidnightToUTC,
} from '../utils/date-helpers.util.js';
import { extractNameParts, getFullName } from '../utils/name-helpers.util.js';
import { logger } from '../utils/logger.util.js';
import type { BirthdayRecord } from '../types.js';

dayjs.extend(utc);
dayjs.extend(timezone);

type CalendarClient = calendar_v3.Calendar;
type CalendarEvent = calendar_v3.Schema$Event;

// --- Client initialization ---

let readOnlyClient: CalendarClient | null = null;
let readWriteClient: CalendarClient | null = null;

function getReadOnlyClient(): CalendarClient {
  if (readOnlyClient) {
    return readOnlyClient;
  }

  const { clientEmail, privateKey } = config.google;
  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  readOnlyClient = google.calendar({ version: 'v3', auth });
  return readOnlyClient;
}

function getReadWriteClient(): CalendarClient {
  if (readWriteClient) {
    return readWriteClient;
  }

  const { clientEmail, privateKey } = config.google;
  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  readWriteClient = google.calendar({ version: 'v3', auth });
  return readWriteClient;
}

// --- Event helpers ---

function isBirthdayEvent(event: CalendarEvent): boolean {
  const summary = (event.summary ?? '').toLowerCase();
  const description = (event.description ?? '').toLowerCase();

  if (summary.includes('birthday') || description.includes('birthday')) {
    return true;
  }

  const hasYearlyRecurrence = event.recurrence?.some(
    (r) => r.includes('YEARLY') || r.includes('FREQ=YEARLY')
  );
  if (!hasYearlyRecurrence) {
    return false;
  }

  const isAllDay = !!event.start?.date && !event.start?.dateTime;
  if (isAllDay) {
    return true;
  }

  const excludedKeywords = ['meeting', 'reminder', 'appointment'];
  return summary.length > 0 && !excludedKeywords.some((k) => summary.includes(k));
}

function extractNameFromEvent(event: CalendarEvent): string {
  const summary = event.summary ?? '';
  const patterns = [
    /^(.+?)(?:'s)?\s*(?:birthday|birth)/i,
    /birthday[:\s]+(.+)/i,
    /(.+?)\s+birthday/i,
  ];
  const match = patterns.map((p) => summary.match(p)).find((m) => m);
  return match ? match[1].trim() : summary.trim();
}

function eventToBirthdayRecord(event: CalendarEvent): BirthdayRecord | null {
  const startDate = event.start?.date ?? event.start?.dateTime;
  if (!startDate) {
    return null;
  }

  try {
    const birthday = parseDateFromString(startDate);
    const fullName = extractNameFromEvent(event);
    const { firstName, lastName } = extractNameParts(fullName);
    const yearMatch = event.description?.match(/born (\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    return { firstName, lastName, birthday, year };
  } catch {
    return null;
  }
}

// --- Fetching ---

async function fetchEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
  const client = getReadOnlyClient();
  const calendarId = config.google.calendarId;
  const tz = config.schedule.timezone;

  const timeMinUTC = convertMidnightToUTC(startDate);
  const endInTz = dayjs(endDate).tz(tz);
  const nextDayInTz = endInTz.add(1, 'day').startOf('day');
  const timeMaxUTC = nextDayInTz.utc().toDate();

  const startYear = getYearInTimezone(startDate);
  const startMonth = getMonthInTimezone(startDate) - 1;
  const startDay = getDateInTimezone(startDate);
  const endYear = getYearInTimezone(endDate);
  const endMonth = getMonthInTimezone(endDate) - 1;
  const endDay = getDateInTimezone(endDate);

  const response = await client.events.list({
    calendarId,
    timeMin: timeMinUTC.toISOString(),
    timeMax: timeMaxUTC.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const calendarEvents = response.data.items ?? [];

  logger.info(`Google Calendar API returned ${calendarEvents.length} event(s)`, {
    timeMin: timeMinUTC.toISOString(),
    timeMax: timeMaxUTC.toISOString(),
    calendarId,
    sampleEvents: calendarEvents.slice(0, 3).map((e) => ({
      summary: e.summary,
      start: e.start?.date ?? e.start?.dateTime,
      recurrence: e.recurrence,
    })),
  });

  const startDateStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const endDateStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  return calendarEvents.filter((event) => {
    if (event.start?.date) {
      return event.start.date >= startDateStr && event.start.date <= endDateStr;
    }
    return true;
  });
}

export async function fetchBirthdays(date: Date = today()): Promise<BirthdayRecord[]> {
  const events = await fetchEvents(date, date);
  return events
    .filter(isBirthdayEvent)
    .map(eventToBirthdayRecord)
    .filter((r): r is BirthdayRecord => r !== null);
}

export async function fetchBirthdaysInRange(startDate: Date, endDate: Date): Promise<BirthdayRecord[]> {
  const events = await fetchEvents(startDate, endDate);
  return events
    .filter(isBirthdayEvent)
    .map(eventToBirthdayRecord)
    .filter((r): r is BirthdayRecord => r !== null);
}

// --- Writing (Sheets → Calendar sync) ---

function createDuplicateKey(date: Date, name: string): string {
  return `${formatDateISO(date)}|${name.toLowerCase().trim()}`;
}

async function buildExistingBirthdayMap(birthdays: BirthdayRecord[]): Promise<Map<string, boolean>> {
  if (birthdays.length === 0) {
    return new Map();
  }

  const currentYear = today().getFullYear();
  const yearStart = startOfYear(new Date(currentYear, 0, 1));
  const yearEnd = endOfYear(new Date(currentYear, 0, 1));

  const allEvents = await fetchEvents(yearStart, yearEnd);
  const birthdayEvents = allEvents.filter(isBirthdayEvent);

  const uniqueDates = new Map<string, Date[]>();
  for (const birthday of birthdays) {
    const month = getMonthInTimezone(birthday.birthday);
    const day = getDateInTimezone(birthday.birthday);
    const key = `${month}-${day}`;
    if (!uniqueDates.has(key)) {
      uniqueDates.set(key, []);
    }
    uniqueDates.get(key)!.push(birthday.birthday);
  }

  const existingMap = new Map<string, boolean>();

  for (const event of birthdayEvents) {
    const startDate = event.start?.date ?? event.start?.dateTime;
    if (!startDate) {
      continue;
    }

    const eventDate = parseDateFromString(startDate);
    const eventName = extractNameFromEvent(event);
    if (!eventDate || !eventName) {
      continue;
    }

    const eventMonth = getMonthInTimezone(eventDate);
    const eventDay = getDateInTimezone(eventDate);
    const matchingDates = uniqueDates.get(`${eventMonth}-${eventDay}`);
    if (!matchingDates) {
      continue;
    }

    const isRecurring = !!event.recurrence || !!event.recurringEventId;

    if (isRecurring) {
      for (const date of matchingDates) {
        existingMap.set(createDuplicateKey(date, eventName), true);
      }
    } else {
      for (const date of matchingDates) {
        if (eventDate.getTime() === date.getTime()) {
          existingMap.set(createDuplicateKey(date, eventName), true);
        }
      }
    }
  }

  return existingMap;
}

export async function syncBirthdaysToCalendar(
  birthdays: BirthdayRecord[]
): Promise<{ added: number; skipped: number; errors: number }> {
  if (birthdays.length === 0) {
    return { added: 0, skipped: 0, errors: 0 };
  }

  const existingMap = await buildExistingBirthdayMap(birthdays);

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const birthday of birthdays) {
    const fullName = getFullName(birthday.firstName, birthday.lastName);
    const key = createDuplicateKey(birthday.birthday, fullName);

    if (existingMap.has(key)) {
      skipped++;
      continue;
    }

    const dateString = formatDateISO(birthday.birthday);
    try {
      const client = getReadWriteClient();
      await client.events.insert({
        calendarId: config.google.calendarId,
        requestBody: {
          summary: `${fullName}'s Birthday`,
          description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
          start: { date: dateString, timeZone: 'UTC' },
          end: { date: dateString, timeZone: 'UTC' },
          recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
        },
      });
      logger.info('Birthday event created', { title: `${fullName}'s Birthday`, date: dateString });
      added++;
    } catch (error) {
      logger.error(`Error writing birthday for ${fullName}`, error);
      errors++;
    }
  }

  if (skipped > 0) {
    logger.info(`Skipped ${skipped} duplicate birthday(s), added ${added} new`);
  }

  return { added, skipped, errors };
}

export function isAvailable(): boolean {
  return !!(config.google.clientEmail && config.google.privateKey && config.google.calendarId);
}
