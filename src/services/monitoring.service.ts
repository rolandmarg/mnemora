import { AlertingService } from './alerting.service.js';
import { StorageService } from './storage.service.js';
import type { AppContext } from '../app-context.js';
import { today, isFirstDayOfMonth } from '../utils/date-helpers.util.js';

interface ExecutionRecord {
  date: string;
  executed: boolean;
  timestamp: string;
  monthlyDigestSent?: boolean;
}

class MonitoringService {
  private readonly storage = StorageService.getAppStorage();

  constructor(private readonly ctx: AppContext) {}

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
      
      if (this.ctx.isLambda) {
        await this.storage.writeFile(key, recordJson);
        this.ctx.logger.debug('Daily execution recorded in S3', { date: dateStr, success });
      } else {
        this.ctx.logger.info('Daily execution recorded', { date: dateStr, success, monthlyDigestSent });
      }

      this.ctx.clients.cloudWatch.putMetricData(
        this.ctx.config.metrics.namespace,
        [{
          MetricName: 'monitoring.daily_execution',
          Value: success ? 1 : 0,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [{ Name: 'Date', Value: dateStr }, { Name: 'Status', Value: success ? 'success' : 'failure' }],
        }]
      ).catch(() => {});

      if (monthlyDigestSent) {
        this.ctx.clients.cloudWatch.putMetricData(
          this.ctx.config.metrics.namespace,
          [{
            MetricName: 'monitoring.monthly_digest_sent',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [{ Name: 'Date', Value: dateStr }],
          }]
        ).catch(() => {});
      } else if (isFirstDayOfMonth(todayDate)) {
        const alerting = new AlertingService(this.ctx);
        alerting.sendMonthlyDigestFailedAlert(new Error('Monthly digest not sent on first of month'), {
          date: dateStr,
          executed: success,
        });
      }
    } catch (error) {
      this.ctx.logger.error('Error recording daily execution', error);
    }
  }

  async checkDailyExecution(): Promise<boolean> {
    const todayDate = today();
    const dateStr = todayDate.toISOString().split('T')[0];

    try {
      if (this.ctx.isLambda) {
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
        this.ctx.logger.warn('Daily execution not detected today', { date: dateStr, hour: hours });
      }

      return false;
    } catch (error) {
      this.ctx.logger.error('Error checking daily execution', error);
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
      if (this.ctx.isLambda) {
        const key = `executions/${dateStr}.json`;
        const data = await this.storage.readFile(key);
        if (data) {
          const record: ExecutionRecord = JSON.parse(data.toString('utf-8'));
          const sent = record.monthlyDigestSent ?? false;
          
          if (!sent) {
            const alerting = new AlertingService(this.ctx);
            alerting.sendMonthlyDigestFailedAlert(new Error('Monthly digest not sent on first of month'), {
              date: dateStr,
              checked: true,
            });
          }
          
          return sent;
        }
      }

      const alerting = new AlertingService(this.ctx);
      alerting.sendMonthlyDigestFailedAlert(new Error('Unable to verify monthly digest status'), {
        date: dateStr,
        checked: true,
      });
      return false;
    } catch (error) {
      this.ctx.logger.error('Error checking monthly digest', error);
      const alerting = new AlertingService(this.ctx);
      alerting.sendMonthlyDigestFailedAlert(error instanceof Error ? error : new Error(String(error)), {
        date: dateStr,
        checked: true,
      });
      return false;
    }
  }
}

export { MonitoringService };

