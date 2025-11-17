import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { StorageService } from './storage.service.js';
import { today, startOfDay } from '../utils/date-helpers.util.js';
import type { AppContext } from '../app-context.js';

const LAST_RUN_FILE = join(process.cwd(), 'logs', 'last-run.txt');
const S3_LAST_RUN_KEY = 'last-run.txt';

class LastRunTrackerService {
  private readonly storage = StorageService.getAppStorage();

  constructor(private readonly ctx: AppContext) {}

  async getLastRunDate(): Promise<Date | null> {
    try {
      if (this.ctx.isLambda) {
        try {
          const data = await this.storage.readFile(S3_LAST_RUN_KEY);
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
          this.ctx.logger.warn('Error reading last run date from S3, will return null', error);
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
        this.ctx.logger.warn('Invalid last run date in file, resetting');
        return null;
      }

      return startOfDay(date);
    } catch (error) {
      this.ctx.logger.error('Error reading last run date', error);
      return null;
    }
  }

  async updateLastRunDate(): Promise<void> {
    try {
      const todayDate = today();
      const dateString = todayDate.toISOString();

      if (this.ctx.isLambda) {
        try {
          await this.storage.writeFile(S3_LAST_RUN_KEY, dateString);
          this.ctx.logger.info('Last run date updated in S3', { date: dateString });
          return;
        } catch (error) {
          this.ctx.logger.warn('Error updating last run date in S3', error);
        }
      }

      const logsDir = join(process.cwd(), 'logs');
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true });
      }

      writeFileSync(LAST_RUN_FILE, dateString, 'utf-8');
      this.ctx.logger.info('Last run date updated', { date: dateString });
    } catch (error) {
      this.ctx.logger.error('Error updating last run date', error);
    }
  }

  async getMissedDates(): Promise<Date[]> {
    const lastRun = await this.getLastRunDate();
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
}

export { LastRunTrackerService };

