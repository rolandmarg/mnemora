import { sendMonthlyDigestFailedAlert, alerting } from './alerting.service.js';
import { metrics } from './metrics.service.js';
import { logger } from '../clients/logger.client.js';
import { createWhatsAppSessionStorage } from '../utils/storage.util.js';
import { today, isFirstDayOfMonth } from '../utils/date-helpers.util.js';

interface ExecutionRecord {
  date: string;
  executed: boolean;
  timestamp: string;
  monthlyDigestSent?: boolean;
}

class MonitoringService {
  private readonly isLambda: boolean;
  private readonly storage: ReturnType<typeof createWhatsAppSessionStorage>;

  constructor() {
    this.isLambda = !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ??
      process.env.LAMBDA_TASK_ROOT ??
      process.env.AWS_EXECUTION_ENV
    );
    this.storage = createWhatsAppSessionStorage();
  }

  async recordDailyExecution(success: boolean, monthlyDigestSent: boolean = false): Promise<void> {
    const todayDate = today();
    const dateStr = todayDate.toISOString().split('T')[0];

    const record: ExecutionRecord = {
      date: dateStr,
      executed: success,
      timestamp: new Date().toISOString(),
      monthlyDigestSent,
    };

    try {
      const key = `executions/${dateStr}.json`;
      const recordJson = JSON.stringify(record);
      
      if (this.isLambda) {
        await this.storage.writeFile(key, recordJson);
        logger.debug('Daily execution recorded in S3', { date: dateStr, success });
      } else {
        logger.info('Daily execution recorded', { date: dateStr, success, monthlyDigestSent });
      }

      metrics.addMetric(
        'monitoring.daily_execution',
        success ? 1 : 0,
        'Count',
        { Date: dateStr, Status: success ? 'success' : 'failure' }
      );

      if (monthlyDigestSent) {
        metrics.addMetric(
          'monitoring.monthly_digest_sent',
          1,
          'Count',
          { Date: dateStr }
        );
        await alerting.resolveAlert('monthly-digest-failed').catch(() => {});
      } else if (isFirstDayOfMonth(todayDate)) {
        sendMonthlyDigestFailedAlert(new Error('Monthly digest not sent on first of month'), {
          date: dateStr,
          executed: success,
        });
      }
      
      if (success) {
        await alerting.resolveAlert('daily-execution-missed').catch(() => {});
      }
    } catch (error) {
      logger.error('Error recording daily execution', error);
    }
  }

  async checkDailyExecution(): Promise<boolean> {
    const todayDate = today();
    const dateStr = todayDate.toISOString().split('T')[0];

    try {
      if (this.isLambda) {
        const key = `executions/${dateStr}.json`;
        const data = await this.storage.readFile(key);
        if (data) {
          const record: ExecutionRecord = JSON.parse(data.toString('utf-8'));
          return record.executed ?? false;
        }
      }

      const now = new Date();
      const hours = now.getHours();
      if (hours >= 10) {
        logger.warn('Daily execution not detected today', { date: dateStr, hour: hours });
      }

      return false;
    } catch (error) {
      logger.error('Error checking daily execution', error);
      return false;
    }
  }

  async checkMonthlyDigestSent(): Promise<boolean> {
    if (!isFirstDayOfMonth(today())) {
      return true;
    }

    const todayDate = today();
    const dateStr = todayDate.toISOString().split('T')[0];

    try {
      if (this.isLambda) {
        const key = `executions/${dateStr}.json`;
        const data = await this.storage.readFile(key);
        if (data) {
          const record: ExecutionRecord = JSON.parse(data.toString('utf-8'));
          const sent = record.monthlyDigestSent ?? false;
          
          if (!sent) {
            sendMonthlyDigestFailedAlert(new Error('Monthly digest not sent on first of month'), {
              date: dateStr,
              checked: true,
            });
          }
          
          return sent;
        }
      }

      sendMonthlyDigestFailedAlert(new Error('Unable to verify monthly digest status'), {
        date: dateStr,
        checked: true,
      });
      return false;
    } catch (error) {
      logger.error('Error checking monthly digest', error);
      sendMonthlyDigestFailedAlert(error instanceof Error ? error : new Error(String(error)), {
        date: dateStr,
        checked: true,
      });
      return false;
    }
  }

}

export const monitoring = new MonitoringService();

