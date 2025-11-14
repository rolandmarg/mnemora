import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { today, startOfDay } from './date-helpers.js';
import { logger } from './logger.js';
import { createWhatsAppSessionStorage } from './s3-storage.js';

const LAST_RUN_FILE = join(process.cwd(), 'logs', 'last-run.txt');
const S3_LAST_RUN_KEY = 'last-run.txt';

/**
 * Check if running in Lambda environment
 */
function isLambdaEnvironment(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

/**
 * Get the last run date
 * @returns Date of last run, or null if never run
 */
export async function getLastRunDate(): Promise<Date | null> {
  try {
    if (isLambdaEnvironment()) {
      // Use S3 in Lambda (cheaper than DynamoDB)
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

    // Local environment: use file system
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
export async function updateLastRunDate(): Promise<void> {
  try {
    const todayDate = today();
    const dateString = todayDate.toISOString();

    if (isLambdaEnvironment()) {
      // Use S3 in Lambda (cheaper than DynamoDB)
      try {
        const storage = createWhatsAppSessionStorage();
        await storage.writeFile(S3_LAST_RUN_KEY, dateString);
        logger.info('Last run date updated in S3', { date: dateString });
        return;
      } catch (error) {
        logger.warn('Error updating last run date in S3', error);
        // Continue to try local file as fallback (though it won't persist in Lambda)
      }
    }

    // Local environment: use file system
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

/**
 * Get list of missed dates since last run
 * @returns Array of dates that were missed
 */
export async function getMissedDates(): Promise<Date[]> {
  const lastRun = await getLastRunDate();
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

