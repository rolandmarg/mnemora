import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { StorageService } from './storage.service.js';
import { today, startOfDay } from '../utils/date-helpers.util.js';
import { isLambda } from '../utils/runtime.util.js';
import type { Logger } from '../types/logger.types.js';

const LAST_RUN_FILE = join(process.cwd(), 'logs', 'last-run.txt');
const S3_LAST_RUN_KEY = 'last-run.txt';

class LastRunTrackerService {
  private readonly storage = StorageService.getAppStorage();
  private pendingLastRunDate: string | null = null;

  constructor(private readonly logger: Logger) {}

  async getLastRunDate(): Promise<Date | null> {
    try {
      if (isLambda()) {
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
          this.logger.warn('Error reading last run date from S3, will return null', error);
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
        this.logger.warn('Invalid last run date in file, resetting');
        return null;
      }

      return startOfDay(date);
    } catch (error) {
      this.logger.error('Error reading last run date', error);
      return null;
    }
  }

  updateLastRunDate(): void {
    const todayDate = today();
    const dateString = todayDate.toISOString();
    
    // Store date in memory for later batch write
    this.pendingLastRunDate = dateString;
    
    if (isLambda()) {
      this.logger.info('Last run date updated (pending S3 write)', { date: dateString });
    } else {
      // In local mode, write immediately (not Lambda)
      this.flushPendingWrites().catch(() => {});
    }
  }

  async flushPendingWrites(): Promise<void> {
    if (!this.pendingLastRunDate) {
      return;
    }

    try {
      if (isLambda()) {
        try {
          await this.storage.writeFile(S3_LAST_RUN_KEY, this.pendingLastRunDate);
          this.logger.info('Last run date updated in S3', { date: this.pendingLastRunDate });
        } catch (error) {
          this.logger.warn('Error updating last run date in S3', error);
        }
      } else {
        const logsDir = join(process.cwd(), 'logs');
        if (!existsSync(logsDir)) {
          mkdirSync(logsDir, { recursive: true });
        }

        writeFileSync(LAST_RUN_FILE, this.pendingLastRunDate, 'utf-8');
        this.logger.info('Last run date updated', { date: this.pendingLastRunDate });
      }
      
      this.pendingLastRunDate = null;
    } catch (error) {
      this.logger.error('Error flushing last run date', error);
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

