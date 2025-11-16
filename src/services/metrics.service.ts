import type { MetricDatum } from '@aws-sdk/client-cloudwatch';
import { getCorrelationId } from '../utils/correlation.util.js';
import type { AppContext } from '../app-context.js';
import type { MetricUnit, MetricDataPoint } from '../types/metrics.types.js';

class MetricsCollector {
  private metrics: MetricDataPoint[] = [];
  private readonly namespace: string;
  private readonly enabled: boolean;
  private readonly batchSize: number = 20;

  constructor(private readonly ctx: AppContext) {
    this.namespace = process.env.METRICS_NAMESPACE ?? 'Mnemora/BirthdayBot';
    this.enabled = process.env.ENABLE_CLOUDWATCH_METRICS !== 'false' && ctx.isLambda;
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

    if (!this.ctx.isLambda) {
      this.ctx.logger.debug('Metric recorded', {
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
    if (!this.enabled || !this.ctx.clients.cloudWatch.isAvailable() || this.metrics.length === 0) {
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

        await this.ctx.clients.cloudWatch.putMetricData(this.namespace, metricData);
      }));

      this.ctx.logger.debug(`Flushed ${this.metrics.length} metrics to CloudWatch`);
      this.metrics = [];
    } catch (error) {
      this.ctx.logger.error('Failed to flush metrics to CloudWatch', error);
    }
  }

  getMetrics(): MetricDataPoint[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
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

export function trackApiCall(metrics: MetricsCollector, service: 'calendar' | 'sheets', success: boolean = true): void {
  metrics.incrementCounter(`api.${service}.calls`, 1, { Status: success ? 'success' : 'failure' });
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

