/**
 * Metrics Collection System
 * 
 * Tracks execution metrics (duration, success/failure, API calls)
 * and business metrics (birthdays sent, messages delivered, etc.)
 * Integrates with CloudWatch Metrics for AWS Lambda
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { logger } from './logger.js';
import { getCorrelationId } from './correlation.js';
import { config } from '../config.js';

/**
 * Metric types
 */
export type MetricUnit = 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' | 'None';

/**
 * Metric data point
 */
export interface MetricDataPoint {
  name: string;
  value: number;
  unit: MetricUnit;
  timestamp?: Date;
  dimensions?: Record<string, string>;
}

/**
 * Metrics collector
 */
class MetricsCollector {
  private metrics: MetricDataPoint[] = [];
  private cloudWatchClient: CloudWatchClient | null = null;
  private readonly namespace: string;
  private readonly enabled: boolean;
  private readonly batchSize: number = 20; // CloudWatch limit per request

  constructor() {
    this.namespace = process.env.METRICS_NAMESPACE ?? 'Mnemora/BirthdayBot';
    this.enabled = process.env.ENABLE_CLOUDWATCH_METRICS !== 'false' && this.isLambdaEnvironment();

    if (this.enabled && config.aws?.region) {
      this.cloudWatchClient = new CloudWatchClient({
        region: config.aws.region,
      });
    }
  }

  /**
   * Check if running in Lambda environment
   */
  private isLambdaEnvironment(): boolean {
    return !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ??
      process.env.LAMBDA_TASK_ROOT ??
      process.env.AWS_EXECUTION_ENV
    );
  }

  /**
   * Add a metric
   */
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

    // Log metric for local development
    if (!this.isLambdaEnvironment()) {
      logger.debug('Metric recorded', {
        name,
        value,
        unit,
        dimensions: metricDimensions,
      });
    }
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, value: number = 1, dimensions?: Record<string, string>): void {
    this.addMetric(name, value, 'Count', dimensions);
  }

  /**
   * Record a duration metric
   */
  recordDuration(name: string, milliseconds: number, dimensions?: Record<string, string>): void {
    this.addMetric(name, milliseconds, 'Milliseconds', dimensions);
  }

  /**
   * Record a value metric
   */
  recordValue(name: string, value: number, unit: MetricUnit = 'None', dimensions?: Record<string, string>): void {
    this.addMetric(name, value, unit, dimensions);
  }

  /**
   * Flush metrics to CloudWatch
   */
  async flush(): Promise<void> {
    if (!this.enabled || !this.cloudWatchClient || this.metrics.length === 0) {
      return;
    }

    try {
      // Batch metrics (CloudWatch limit is 20 per request)
      const batches: MetricDataPoint[][] = [];
      for (let i = 0; i < this.metrics.length; i += this.batchSize) {
        batches.push(this.metrics.slice(i, i + this.batchSize));
      }

      // Send each batch
      for (const batch of batches) {
        const metricData: MetricDatum[] = batch.map(metric => ({
          MetricName: metric.name,
          Value: metric.value,
          Unit: metric.unit,
          Timestamp: metric.timestamp,
          Dimensions: metric.dimensions
            ? Object.entries(metric.dimensions).map(([Name, Value]) => ({ Name, Value }))
            : undefined,
        }));

        const command = new PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: metricData,
        });

        await this.cloudWatchClient.send(command);
      }

      logger.debug(`Flushed ${this.metrics.length} metrics to CloudWatch`);
      this.metrics = [];
    } catch (error) {
      logger.error('Failed to flush metrics to CloudWatch', error);
      // Don't throw - metrics are non-critical
    }
  }

  /**
   * Get all collected metrics (for testing/debugging)
   */
  getMetrics(): MetricDataPoint[] {
    return [...this.metrics];
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
}

/**
 * Global metrics collector instance
 */
export const metrics = new MetricsCollector();

/**
 * Convenience functions for common metrics
 */

/**
 * Track execution start
 */
export function trackExecutionStart(): void {
  metrics.incrementCounter('execution.started');
}

/**
 * Track execution completion
 */
export function trackExecutionComplete(durationMs: number, success: boolean = true): void {
  metrics.incrementCounter(success ? 'execution.completed' : 'execution.failed');
  metrics.recordDuration('execution.duration', durationMs);
}

/**
 * Track birthday fetch
 */
export function trackBirthdayFetch(count: number): void {
  metrics.incrementCounter('birthdays.fetched', count);
}

/**
 * Track birthday message sent
 */
export function trackBirthdaySent(count: number = 1): void {
  metrics.incrementCounter('birthdays.sent', count);
}

/**
 * Track monthly digest sent
 */
export function trackMonthlyDigestSent(): void {
  metrics.incrementCounter('monthly_digest.sent');
}

/**
 * Track missed days detected
 */
export function trackMissedDaysDetected(count: number): void {
  metrics.incrementCounter('missed_days.detected', count);
}

/**
 * Track API call
 */
export function trackApiCall(service: 'calendar' | 'sheets', success: boolean = true): void {
  metrics.incrementCounter(`api.${service}.calls`, 1, { Status: success ? 'success' : 'failure' });
}

/**
 * Track WhatsApp message sent
 */
export function trackWhatsAppMessageSent(success: boolean = true): void {
  metrics.incrementCounter(success ? 'whatsapp.messages.sent' : 'whatsapp.messages.failed');
}

/**
 * Track WhatsApp authentication required
 */
export function trackWhatsAppAuthRequired(): void {
  metrics.incrementCounter('whatsapp.auth.required');
}

/**
 * Track WhatsApp session refreshed
 */
export function trackWhatsAppSessionRefreshed(): void {
  metrics.incrementCounter('whatsapp.session.refreshed');
}

/**
 * Track operation duration
 */
export function trackOperationDuration(operation: string, durationMs: number, dimensions?: Record<string, string>): void {
  metrics.recordDuration(`operation.${operation}.duration`, durationMs, dimensions);
}

