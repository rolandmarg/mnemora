import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../clients/logger.client.js';
import { today, startOfDay } from './date-helpers.util.js';
import { createWhatsAppSessionStorage } from './storage.util.js';
import { isLambdaEnvironment } from './env.util.js';

const LAST_RUN_FILE = join(process.cwd(), 'logs', 'last-run.txt');
const S3_LAST_RUN_KEY = 'last-run.txt';

export async function getLastRunDate(): Promise<Date | null> {
  try {
    if (isLambdaEnvironment()) {
      try {
        const storage = createWhatsAppSessionStorage();
        const data = await storage.readFile(S3_LAST_RUN_KEY);
        if (data) {
          const content = data.toString('utf-8').trim();
          if (content) {
            const date = new Date(content);
            if (!isNaN(date.getTime())) {
              return startOfDay(date);
            }
          }
        }
      } catch (error) {
        logger.warn('Error reading last run date from S3, will return null', error);
      }
      return null;
    }

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

export async function updateLastRunDate(): Promise<void> {
  try {
    const todayDate = today();
    const dateString = todayDate.toISOString();

    if (isLambdaEnvironment()) {
      try {
        const storage = createWhatsAppSessionStorage();
        await storage.writeFile(S3_LAST_RUN_KEY, dateString);
        logger.info('Last run date updated in S3', { date: dateString });
        return;
      } catch (error) {
        logger.warn('Error updating last run date in S3', error);
      }
    }

    const logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    writeFileSync(LAST_RUN_FILE, dateString, 'utf-8');
    logger.info('Last run date updated', { date: dateString });
  } catch (error) {
    logger.error('Error updating last run date', error);
  }
}

export async function getMissedDates(): Promise<Date[]> {
  const lastRun = await getLastRunDate();
  const todayDate = startOfDay(today());
  const missedDates: Date[] = [];

  if (!lastRun) {
    return [];
  }

  const lastRunTime = lastRun.getTime();
  const todayTime = todayDate.getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  let currentDate = new Date(lastRunTime + oneDay);

  while (currentDate.getTime() < todayTime) {
    missedDates.push(new Date(currentDate));
    currentDate = new Date(currentDate.getTime() + oneDay);
  }

  return missedDates;
}

