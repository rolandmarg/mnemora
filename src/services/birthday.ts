import * as googleCalendar from '../clients/googleCalendar.js';
import * as googleSheets from '../clients/googleSheets.js';
import * as whatsapp from '../clients/whatsapp.js';
import { getFullName } from '../utils/name-helpers.util.js';
import {
  today,
  formatDateShort,
  formatDateMonthYear,
  startOfDay,
  isFirstDayOfMonth,
  startOfMonth,
  endOfMonth,
  formatTimestampHumanReadable,
} from '../utils/date-helpers.util.js';
import { config } from '../config.js';
import { initializeCorrelationId } from '../utils/runtime.util.js';
import type { Logger, BirthdayRecord } from '../types.js';

// --- Message formatting ---

function formatMonthlyDigest(birthdays: BirthdayRecord[]): string {
  if (birthdays.length === 0) {
    return `📅 No birthdays scheduled for ${formatDateMonthYear(today())}.`;
  }

  const sorted = [...birthdays].sort((a, b) => a.birthday.getTime() - b.birthday.getTime());
  const byDate = sorted.reduce<Record<string, string[]>>((acc, r) => {
    const key = formatDateShort(r.birthday);
    (acc[key] ??= []).push(getFullName(r.firstName, r.lastName));
    return acc;
  }, {});

  const dates = Object.keys(byDate);
  const maxWidth = Math.max(...dates.map(d => `${d}: `.length));
  const lines = dates.map(d => `${`${d}: `.padEnd(maxWidth)}${byDate[d].join(', ')}`);

  return `Upcoming birthdays 🎂\n\n${lines.join('\n')}`;
}

function formatBirthdayMessages(birthdays: BirthdayRecord[]): string[] {
  if (birthdays.length === 0) {
    return [];
  }
  if (birthdays.length === 1) {
    return [`Happy birthday ${birthdays[0].firstName}! 🎂`];
  }

  const names = birthdays.map(r => r.firstName);
  const combined =
    names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  return [`Happy birthday ${combined}! 🎂`];
}

function formatHealthCheckMessage(birthdayCount: number, authAgeDays: number | null): string {
  const now = new Date();
  const lines = [
    'Mnemora Health Check',
    `Status: OK`,
    `Time: ${formatTimestampHumanReadable(now)}`,
    `Auth age: ${authAgeDays !== null ? `${authAgeDays} day${authAgeDays !== 1 ? 's' : ''}` : 'unknown'}`,
    `Birthdays today: ${birthdayCount}`,
  ];
  return lines.join('\n');
}

// --- Sheets → Calendar sync ---

async function trySyncFromSheets(logger: Logger): Promise<void> {
  if (!googleSheets.isAvailable()) {
    logger.info('Sheets not configured, skipping sync');
    return;
  }

  try {
    logger.info('Syncing birthdays from Sheets to Calendar...');
    const sheetBirthdays = await googleSheets.fetchBirthdays();
    const result = await googleCalendar.syncBirthdaysToCalendar(sheetBirthdays);
    logger.info('Synced birthdays from Sheets to Calendar', result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to sync from Sheets to Calendar', { error: msg });
  }
}

// --- Birthday fetching ---

async function getTodaysBirthdaysWithOptionalDigest(): Promise<{
  todaysBirthdays: BirthdayRecord[];
  monthlyBirthdays?: BirthdayRecord[];
}> {
  const todayDate = today();

  if (isFirstDayOfMonth(todayDate)) {
    const monthStart = startOfMonth(todayDate);
    const monthEnd = endOfMonth(todayDate);
    const monthRecords = await googleCalendar.fetchBirthdaysInRange(monthStart, monthEnd);
    const todayStart = startOfDay(todayDate);
    const todaysBirthdays = monthRecords.filter(
      (r) => startOfDay(r.birthday).getTime() === todayStart.getTime()
    );
    return { todaysBirthdays, monthlyBirthdays: monthRecords };
  }

  const todaysBirthdays = await googleCalendar.fetchBirthdays(todayDate);
  return { todaysBirthdays };
}

// --- Main entry point ---

export async function runBirthdayCheck(logger: Logger): Promise<void> {
  initializeCorrelationId();

  try {
    await trySyncFromSheets(logger);

    logger.info('Running birthday check...');
    const { todaysBirthdays, monthlyBirthdays } = await getTodaysBirthdaysWithOptionalDigest();

    await whatsapp.initialize(logger);

    try {
      // Always send health check to monitoring group
      const healthCheckGroupName = config.whatsapp.healthCheckGroupName;
      if (healthCheckGroupName) {
        try {
          const authAgeDays = await whatsapp.getAuthAgeDays();
          const healthMessage = formatHealthCheckMessage(todaysBirthdays.length, authAgeDays);
          logger.info('Sending health check...');
          const result = await whatsapp.sendToGroup(healthCheckGroupName, healthMessage, logger);
          logger.info('Health check sent', { messageId: result.id });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn('Health check failed, continuing with birthday messages', { error: msg });
        }
      }

      // Send birthday messages to main group
      if (monthlyBirthdays) {
        const digest = formatMonthlyDigest(monthlyBirthdays);
        logger.info('Sending monthly digest...');
        const result = await whatsapp.sendMessage(digest, logger);
        logger.info('Monthly digest sent', { messageId: result.id });
      }

      if (todaysBirthdays.length > 0) {
        logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
          birthdays: todaysBirthdays.map((r) => getFullName(r.firstName, r.lastName)),
        });

        const messages = formatBirthdayMessages(todaysBirthdays);
        for (const message of messages) {
          const result = await whatsapp.sendMessage(message, logger);
          logger.info('Birthday message sent', { messageId: result.id });
        }
      }

      logger.info('Birthday check completed successfully!');
    } finally {
      await whatsapp.destroy(logger);
    }
  } catch (error) {
    logger.error('Error in birthday check', error);
    throw error;
  }
}
