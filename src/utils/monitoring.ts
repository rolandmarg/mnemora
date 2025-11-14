/**
 * Monitoring Service
 * 
 * Tracks daily execution and monthly WhatsApp message status
 * Uses S3 for storage (cheaper than DynamoDB) and CloudWatch Metrics
 */

import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { createWhatsAppSessionStorage } from './s3-storage.js';
import { today, isFirstDayOfMonth } from './date-helpers.js';
import { sendMonthlyDigestFailedAlert, alerting } from './alerting.js';

/**
 * Execution record stored in S3 or file
 */
interface ExecutionRecord {
  date: string; // YYYY-MM-DD
  executed: boolean;
  timestamp: string;
  monthlyDigestSent?: boolean;
}

/**
 * Monitoring service for tracking execution and message delivery
 */
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

  /**
   * Record daily execution
   */
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
      // Store in S3 (cheaper than DynamoDB for once-a-day script)
      const key = `executions/${dateStr}.json`;
      const recordJson = JSON.stringify(record);
      
      if (this.isLambda) {
        await this.storage.writeFile(key, recordJson);
        logger.debug('Daily execution recorded in S3', { date: dateStr, success });
      } else {
        // Local: just log (file system not needed for monitoring)
        logger.info('Daily execution recorded', { date: dateStr, success, monthlyDigestSent });
      }

      // Emit CloudWatch metric (this is the main tracking mechanism)
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
        // Resolve monthly digest alert if it was active
        await alerting.resolveAlert('monthly-digest-failed').catch(() => {
          // Ignore errors - non-critical
        });
      } else if (isFirstDayOfMonth(todayDate)) {
        // If it's the 1st and monthly digest wasn't sent, send CRITICAL alert
        sendMonthlyDigestFailedAlert(new Error('Monthly digest not sent on first of month'), {
          date: dateStr,
          executed: success,
        });
      }
      
      // Resolve daily execution missed alert if execution succeeded
      if (success) {
        await alerting.resolveAlert('daily-execution-missed').catch(() => {
          // Ignore errors - non-critical
        });
      }
    } catch (error) {
      logger.error('Error recording daily execution', error);
      // Don't throw - monitoring is non-critical
    }
  }

  /**
   * Check if daily execution happened today
   * Also checks for missed executions and sends alerts
   */
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

      // Check if execution is missed (no execution today and it's past 10 AM)
      const now = new Date();
      const hours = now.getHours();
      if (hours >= 10) {
        // Past 10 AM, execution should have happened
        // This will be checked by CloudWatch alarm, but we can also send alert here
        logger.warn('Daily execution not detected today', { date: dateStr, hour: hours });
        // Note: CloudWatch alarm will handle the alert, but we can also send here if needed
      }

      // Fallback: assume not executed if we can't check
      return false;
    } catch (error) {
      logger.error('Error checking daily execution', error);
      return false;
    }
  }

  /**
   * Check if monthly digest was sent this month
   * Sends alert if it's the 1st and digest wasn't sent
   */
  async checkMonthlyDigestSent(): Promise<boolean> {
    if (!isFirstDayOfMonth(today())) {
      // Not first of month, assume sent
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
          
          // If it's the 1st and digest wasn't sent, send CRITICAL alert
          if (!sent) {
            sendMonthlyDigestFailedAlert(new Error('Monthly digest not sent on first of month'), {
              date: dateStr,
              checked: true,
            });
          }
          
          return sent;
        }
      }

      // If we can't check and it's the 1st, assume not sent and send alert
      sendMonthlyDigestFailedAlert(new Error('Unable to verify monthly digest status'), {
        date: dateStr,
        checked: true,
      });
      return false;
    } catch (error) {
      logger.error('Error checking monthly digest', error);
      // If it's the 1st and we can't check, send alert
      sendMonthlyDigestFailedAlert(error instanceof Error ? error : new Error(String(error)), {
        date: dateStr,
        checked: true,
      });
      return false;
    }
  }

  /**
   * Emit health check metrics
   */
  async emitHealthMetrics(): Promise<void> {
    try {
      const dailyExecuted = await this.checkDailyExecution();
      const monthlySent = await this.checkMonthlyDigestSent();

      // Emit metrics for monitoring
      metrics.addMetric('monitoring.health.daily_execution', dailyExecuted ? 1 : 0, 'Count');
      metrics.addMetric('monitoring.health.monthly_digest', monthlySent ? 1 : 0, 'Count');

      logger.debug('Health metrics emitted', { dailyExecuted, monthlySent });
    } catch (error) {
      logger.error('Error emitting health metrics', error);
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    dailyExecution: boolean;
    monthlyDigest: boolean;
    timestamp: string;
  }> {
    const dailyExecuted = await this.checkDailyExecution();
    const monthlySent = await this.checkMonthlyDigestSent();
    const isFirstDay = isFirstDayOfMonth(today());

    // Health check logic:
    // - Daily execution should have happened today (or it's OK if it's early in the day)
    // - Monthly digest should be sent if it's the first of the month
    const healthy = dailyExecuted || (new Date().getHours() < 10); // Allow grace period until 10 AM
    const monthlyHealthy = !isFirstDay || monthlySent;

    return {
      healthy: healthy && monthlyHealthy,
      dailyExecution: dailyExecuted,
      monthlyDigest: monthlySent,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Global monitoring service instance
 */
export const monitoring = new MonitoringService();

