import type { MetricDatum } from '@aws-sdk/client-cloudwatch';
import { getCorrelationId, isLambda } from '../utils/runtime.util.js';
import { StorageService } from './storage.service.js';
import { today, isFirstDayOfMonth } from '../utils/date-helpers.util.js';
import type { Logger } from '../types/logger.types.js';
import type { AppConfig } from '../config.js';
import type { MetricUnit, MetricDataPoint } from '../types/metrics.types.js';
import type { AlertingService } from './alerting.service.js';
import cloudWatchMetricsClientDefault from '../clients/cloudwatch.client.js';

type CloudWatchClient = typeof cloudWatchMetricsClientDefault;

interface ExecutionRecord {
  date: string;
  executed: boolean;
  timestamp: string;
  monthlyDigestSent?: boolean;
}

interface MetricsCollectorOptions {
  logger: Logger;
  config: AppConfig;
  cloudWatchClient: CloudWatchClient;
  alerting: AlertingService;
}

class MetricsCollector {
  private metrics: MetricDataPoint[] = [];
  private readonly logger: Logger;
  private readonly cloudWatchClient: CloudWatchClient;
  private readonly alerting: AlertingService;
  private readonly namespace: string;
  private readonly enabled: boolean;
  private readonly batchSize: number = 20;
  private readonly storage = StorageService.getAppStorage();

  constructor(options: MetricsCollectorOptions) {
    const { logger, cloudWatchClient, alerting, config } = options;
    this.logger = logger;
    this.cloudWatchClient = cloudWatchClient;
    this.alerting = alerting;
    this.namespace = config.metrics.namespace;
    this.enabled = config.metrics.enabled && isLambda();
  }

  addMetric(
    name: string,
    value: number,
    unit: MetricUnit = 'Count',
    dimensions?: Record<string, string>
  ): void {
    const correlationId = getCorrelationId();
    const metricDimensions: Record<string, string> = {
      ...dimensions,
      ...(correlationId && { CorrelationId: correlationId }),
    };

    const metric: MetricDataPoint = {
      name,
      value,
      unit,
      timestamp: new Date(),
      dimensions: metricDimensions,
    };

    this.metrics.push(metric);

    if (!isLambda()) {
      this.logger.debug('Metric recorded', {
        name,
        value,
        unit,
        dimensions: metricDimensions,
      });
    }
  }

  incrementCounter(name: string, value: number = 1, dimensions?: Record<string, string>): void {
    this.addMetric(name, value, 'Count', dimensions);
  }

  recordDuration(name: string, milliseconds: number, dimensions?: Record<string, string>): void {
    this.addMetric(name, milliseconds, 'Milliseconds', dimensions);
  }

  recordValue(name: string, value: number, unit: MetricUnit = 'None', dimensions?: Record<string, string>): void {
    this.addMetric(name, value, unit, dimensions);
  }

  async flush(): Promise<void> {
    if (!this.enabled || !this.cloudWatchClient.isAvailable() || this.metrics.length === 0) {
      return;
    }

    try {
      const batches: MetricDataPoint[][] = [];
      for (let i = 0; i < this.metrics.length; i += this.batchSize) {
        batches.push(this.metrics.slice(i, i + this.batchSize));
      }

      await Promise.all(batches.map(async (batch) => {
        const metricData: MetricDatum[] = batch.map(metric => ({
          MetricName: metric.name,
          Value: metric.value,
          Unit: metric.unit,
          Timestamp: metric.timestamp,
          Dimensions: metric.dimensions
            ? Object.entries(metric.dimensions).map(([Name, Value]) => ({ Name, Value }))
            : undefined,
        }));

        await this.cloudWatchClient.putMetricData(this.namespace, metricData);
      }));

      this.logger.debug(`Flushed ${this.metrics.length} metrics to CloudWatch`);
      this.metrics = [];
    } catch (error) {
      this.logger.error('Failed to flush metrics to CloudWatch', error);
    }
  }

  getMetrics(): MetricDataPoint[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
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
      
      if (isLambda()) {
        await this.storage.writeFile(key, recordJson);
        this.logger.debug('Daily execution recorded in S3', { date: dateStr, success });
      } else {
        this.logger.info('Daily execution recorded', { date: dateStr, success, monthlyDigestSent });
      }

      // Send metrics directly to CloudWatch (bypass batching for execution tracking)
      this.cloudWatchClient.putMetricData(
        this.namespace,
        [{
          MetricName: 'monitoring.daily_execution',
          Value: success ? 1 : 0,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [{ Name: 'Date', Value: dateStr }, { Name: 'Status', Value: success ? 'success' : 'failure' }],
        }]
      ).catch(() => {});

      if (monthlyDigestSent) {
        this.cloudWatchClient.putMetricData(
          this.namespace,
          [{
            MetricName: 'monitoring.monthly_digest_sent',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [{ Name: 'Date', Value: dateStr }],
          }]
        ).catch(() => {});
      } else if (isFirstDayOfMonth(todayDate)) {
        this.alerting.sendMonthlyDigestFailedAlert(new Error('Monthly digest not sent on first of month'), {
          date: dateStr,
          executed: success,
        });
      }
    } catch (error) {
      this.logger.error('Error recording daily execution', error);
    }
  }
}

export function trackExecutionStart(metrics: MetricsCollector): void {
  metrics.incrementCounter('execution.started');
}

export function trackExecutionComplete(metrics: MetricsCollector, durationMs: number, success: boolean = true): void {
  metrics.incrementCounter(success ? 'execution.completed' : 'execution.failed');
  metrics.recordDuration('execution.duration', durationMs);
}

export function trackBirthdayFetch(metrics: MetricsCollector, count: number): void {
  metrics.incrementCounter('birthdays.fetched', count);
}

export function trackBirthdaySent(metrics: MetricsCollector, count: number = 1): void {
  metrics.incrementCounter('birthdays.sent', count);
}

export function trackMonthlyDigestSent(metrics: MetricsCollector): void {
  metrics.incrementCounter('monthly_digest.sent');
}

export function trackMissedDaysDetected(metrics: MetricsCollector, count: number): void {
  metrics.incrementCounter('missed_days.detected', count);
}

export function trackApiCall(
  metrics: MetricsCollector, 
  service: 'calendar' | 'sheets' | 's3', 
  success: boolean = true,
  durationMs?: number
): void {
  metrics.incrementCounter(`api.${service}.calls`, 1, { Status: success ? 'success' : 'failure' });
  if (durationMs !== undefined) {
    metrics.recordDuration(`api.${service}.duration`, durationMs, { Status: success ? 'success' : 'failure' });
  }
}

export function trackWhatsAppMessageSent(metrics: MetricsCollector, success: boolean = true): void {
  metrics.incrementCounter(success ? 'whatsapp.messages.sent' : 'whatsapp.messages.failed');
}

export function trackWhatsAppAuthRequired(metrics: MetricsCollector): void {
  metrics.incrementCounter('whatsapp.auth.required');
}

export function trackOperationDuration(metrics: MetricsCollector, operation: string, durationMs: number, dimensions?: Record<string, string>): void {
  metrics.recordDuration(`operation.${operation}.duration`, durationMs, dimensions);
}

export { MetricsCollector };

