import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { today, startOfDay } from './date-helpers.js';
import { logger } from './logger.js';

const LAST_RUN_FILE = join(process.cwd(), 'logs', 'last-run.txt');

/**
 * Get the last run date
 * @returns Date of last run, or null if never run
 */
export function getLastRunDate(): Date | null {
  try {
    if (!existsSync(LAST_RUN_FILE)) {
      return null;
    }

    const content = readFileSync(LAST_RUN_FILE, 'utf-8').trim();
    if (!content) {
      return null;
    }

    const date = new Date(content);
    if (isNaN(date.getTime())) {
      logger.warn('Invalid last run date in file, resetting');
      return null;
    }

    return startOfDay(date);
  } catch (error) {
    logger.error('Error reading last run date', error);
    return null;
  }
}

/**
 * Update the last run date to today
 */
export function updateLastRunDate(): void {
  try {
    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    const todayDate = today();
    writeFileSync(LAST_RUN_FILE, todayDate.toISOString(), 'utf-8');
    logger.info('Last run date updated', { date: todayDate.toISOString() });
  } catch (error) {
    logger.error('Error updating last run date', error);
  }
}

/**
 * Get list of missed dates since last run
 * @returns Array of dates that were missed
 */
export function getMissedDates(): Date[] {
  const lastRun = getLastRunDate();
  const todayDate = startOfDay(today());
  const missedDates: Date[] = [];

  if (!lastRun) {
    // Never run before, no missed dates
    return [];
  }

  // Calculate days between last run and today (exclusive of today)
  const lastRunTime = lastRun.getTime();
  const todayTime = todayDate.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  // Start from the day after last run
  let currentDate = new Date(lastRunTime + oneDay);

  // Add all dates between last run and today (exclusive)
  while (currentDate.getTime() < todayTime) {
    missedDates.push(new Date(currentDate));
    currentDate = new Date(currentDate.getTime() + oneDay);
  }

  return missedDates;
}

