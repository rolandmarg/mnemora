/**
 * Alerting Service
 * 
 * Sends alerts via SNS (email + SMS) for all error scenarios
 * Supports severity levels: CRITICAL, WARNING, INFO
 * Implements alert deduplication and state tracking
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { logger } from './logger.js';
import { createWhatsAppSessionStorage } from './s3-storage.js';
import { getCorrelationId } from './correlation.js';
import { config } from '../config.js';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

/**
 * Alert types - all possible scenarios
 */
export enum AlertType {
  // CRITICAL alerts
  LAMBDA_EXECUTION_FAILED = 'lambda-execution-failed',
  LAMBDA_TIMEOUT = 'lambda-timeout',
  DAILY_EXECUTION_MISSED = 'daily-execution-missed',
  MONTHLY_DIGEST_FAILED = 'monthly-digest-failed',
  GOOGLE_CALENDAR_API_FAILED = 'google-calendar-api-failed',
  
  // WARNING alerts
  WHATSAPP_MESSAGE_FAILED = 'whatsapp-message-failed',
  WHATSAPP_AUTH_REQUIRED = 'whatsapp-auth-required',
  WHATSAPP_GROUP_NOT_FOUND = 'whatsapp-group-not-found',
  WHATSAPP_CLIENT_INIT_FAILED = 'whatsapp-client-init-failed',
  MISSED_DAYS_RECOVERY_FAILED = 'missed-days-recovery-failed',
  S3_STORAGE_FAILED = 's3-storage-failed',
  CLOUDWATCH_METRICS_FAILED = 'cloudwatch-metrics-failed',
  
  // INFO alerts
  WHATSAPP_AUTH_REFRESH_NEEDED = 'whatsapp-auth-refresh-needed',
  HIGH_EXECUTION_DURATION = 'high-execution-duration',
  API_QUOTA_WARNING = 'api-quota-warning',
}

/**
 * Alert state stored in S3
 */
interface AlertState {
  alertId: string;
  severity: AlertSeverity;
  firstOccurred: string; // ISO timestamp
  lastOccurred: string; // ISO timestamp
  count: number;
  resolved: boolean;
  resolvedAt?: string; // ISO timestamp
  lastSent?: string; // ISO timestamp (for deduplication)
}

/**
 * Active alerts map: alertId -> AlertState
 */
interface ActiveAlerts {
  [alertId: string]: AlertState;
}

/**
 * Alert details for sending
 */
export interface AlertDetails {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  error?: Error | unknown;
  metadata?: Record<string, unknown>;
  remediationSteps?: string[];
}

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
 * Get CloudWatch Logs URL for current execution
 */
function getCloudWatchLogsUrl(): string | undefined {
  if (!isLambdaEnvironment()) {
    return undefined;
  }

  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const region = config.aws?.region ?? process.env.AWS_REGION ?? 'us-east-1';
  const requestId = getCorrelationId();

  if (functionName && requestId) {
    return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(`/aws/lambda/${functionName}`)}/log-events/${encodeURIComponent(requestId)}`;
  }

  return undefined;
}

/**
 * Alerting service
 */
class AlertingService {
  private snsClient: SNSClient | null = null;
  private readonly topicArn: string | undefined;
  private readonly storage: ReturnType<typeof createWhatsAppSessionStorage>;
  private readonly isLambda: boolean;
  private readonly alertStateKey = 'alerts/active-alerts.json';
  private readonly deduplicationWindowMs = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.isLambda = isLambdaEnvironment();
    this.topicArn = process.env.SNS_TOPIC_ARN;

    if (this.isLambda && this.topicArn && config.aws?.region) {
      this.snsClient = new SNSClient({
        region: config.aws.region,
      });
    }

    this.storage = createWhatsAppSessionStorage();
  }

  /**
   * Load active alerts from S3
   */
  private async loadActiveAlerts(): Promise<ActiveAlerts> {
    try {
      if (this.isLambda) {
        const data = await this.storage.readFile(this.alertStateKey);
        if (data) {
          return JSON.parse(data.toString('utf-8')) as ActiveAlerts;
        }
      }
      return {};
    } catch (error) {
      logger.warn('Error loading active alerts, starting fresh', error);
      return {};
    }
  }

  /**
   * Save active alerts to S3
   */
  private async saveActiveAlerts(alerts: ActiveAlerts): Promise<void> {
    try {
      if (this.isLambda) {
        const data = JSON.stringify(alerts, null, 2);
        await this.storage.writeFile(this.alertStateKey, data);
      }
    } catch (error) {
      logger.error('Error saving active alerts', error);
      // Don't throw - alert state is non-critical
    }
  }

  /**
   * Check if alert should be sent (deduplication)
   */
  private shouldSendAlert(alertState: AlertState | undefined, now: Date): boolean {
    if (!alertState) {
      return true; // New alert, always send
    }

    if (alertState.resolved) {
      return true; // Alert was resolved, re-send if it occurs again
    }

    // Check if we've sent this alert recently (within deduplication window)
    if (alertState.lastSent) {
      const lastSentTime = new Date(alertState.lastSent).getTime();
      const timeSinceLastSent = now.getTime() - lastSentTime;
      
      if (timeSinceLastSent < this.deduplicationWindowMs) {
        return false; // Don't send duplicate within 1 hour
      }
    }

    return true; // Send if outside deduplication window
  }

  /**
   * Update alert state
   */
  private async updateAlertState(
    alerts: ActiveAlerts,
    alertId: string,
    severity: AlertSeverity,
    now: Date
  ): Promise<AlertState> {
    const existing = alerts[alertId];
    const nowISO = now.toISOString();

    if (existing && !existing.resolved) {
      // Update existing alert
      existing.lastOccurred = nowISO;
      existing.count += 1;
      existing.lastSent = nowISO;
      return existing;
    }

    // Create new alert
    const newAlert: AlertState = {
      alertId,
      severity,
      firstOccurred: nowISO,
      lastOccurred: nowISO,
      count: 1,
      resolved: false,
      lastSent: nowISO,
    };

    alerts[alertId] = newAlert;
    return newAlert;
  }

  /**
   * Resolve an alert (condition cleared)
   */
  async resolveAlert(alertId: string): Promise<void> {
    try {
      const alerts = await this.loadActiveAlerts();
      const alert = alerts[alertId];

      if (alert && !alert.resolved) {
        alert.resolved = true;
        alert.resolvedAt = new Date().toISOString();
        await this.saveActiveAlerts(alerts);
        logger.info('Alert resolved', { alertId, resolvedAt: alert.resolvedAt });
      }
    } catch (error) {
      logger.error('Error resolving alert', error);
    }
  }

  /**
   * Format alert message for SNS
   */
  private formatAlertMessage(details: AlertDetails, alertState: AlertState): string {
    const correlationId = getCorrelationId();
    const logsUrl = getCloudWatchLogsUrl();
    const now = new Date().toISOString();

    let message = `[${details.severity}] ${details.title}\n\n`;
    message += `Time: ${now}\n`;
    
    if (correlationId) {
      message += `Correlation ID: ${correlationId}\n`;
    }

    message += `\n${details.message}\n`;

    if (details.error) {
      const errorMessage = details.error instanceof Error 
        ? details.error.message 
        : String(details.error);
      message += `\nError: ${errorMessage}\n`;
      
      if (details.error instanceof Error && details.error.stack) {
        message += `\nStack Trace:\n${details.error.stack}\n`;
      }
    }

    if (details.metadata) {
      message += `\nAdditional Details:\n`;
      for (const [key, value] of Object.entries(details.metadata)) {
        message += `  ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    if (alertState.count > 1) {
      message += `\nThis alert has occurred ${alertState.count} time(s) since ${alertState.firstOccurred}\n`;
    }

    if (details.remediationSteps && details.remediationSteps.length > 0) {
      message += `\nRemediation Steps:\n`;
      details.remediationSteps.forEach((step, index) => {
        message += `  ${index + 1}. ${step}\n`;
      });
    }

    if (logsUrl) {
      message += `\nCloudWatch Logs: ${logsUrl}\n`;
    }

    return message;
  }

  /**
   * Send alert via SNS
   */
  async sendAlert(details: AlertDetails): Promise<void> {
    if (!this.snsClient || !this.topicArn) {
      // Not configured or not in Lambda - just log
      logger.warn('Alert would be sent (SNS not configured)', {
        type: details.type,
        severity: details.severity,
        title: details.title,
      });
      return;
    }

    try {
      const now = new Date();
      const alerts = await this.loadActiveAlerts();
      const alertId = details.type;
      const alertState = await this.updateAlertState(alerts, alertId, details.severity, now);

      // Check deduplication
      if (!this.shouldSendAlert(alertState, now)) {
        logger.debug('Alert deduplicated (sent recently)', {
          alertId,
          lastSent: alertState.lastSent,
        });
        await this.saveActiveAlerts(alerts); // Save updated count
        return;
      }

      // Format message
      const message = this.formatAlertMessage(details, alertState);
      const subject = `[${details.severity}] Mnemora Birthday Bot: ${details.title}`;

      // Determine if SMS should be sent
      // CRITICAL: email + SMS, WARNING: email only (SMS optional), INFO: email only
      const sendSMS = details.severity === AlertSeverity.CRITICAL;

      // Send to SNS topic (subscribers decide email/SMS based on subscription)
      await this.snsClient.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Subject: subject,
          Message: message,
          MessageAttributes: {
            Severity: {
              DataType: 'String',
              StringValue: details.severity,
            },
            AlertType: {
              DataType: 'String',
              StringValue: details.type,
            },
            SendSMS: {
              DataType: 'String',
              StringValue: sendSMS ? 'true' : 'false',
            },
          },
        })
      );

      logger.info('Alert sent via SNS', {
        type: details.type,
        severity: details.severity,
        alertId,
        count: alertState.count,
      });

      // Save updated alert state
      await this.saveActiveAlerts(alerts);
    } catch (error) {
      logger.error('Error sending alert via SNS', error, {
        type: details.type,
        severity: details.severity,
      });
      // Don't throw - alerting failures shouldn't break execution
    }
  }

  /**
   * Get all active (unresolved) alerts
   */
  async getActiveAlerts(): Promise<AlertState[]> {
    try {
      const alerts = await this.loadActiveAlerts();
      return Object.values(alerts).filter(alert => !alert.resolved);
    } catch (error) {
      logger.error('Error getting active alerts', error);
      return [];
    }
  }

  /**
   * Generate and send daily summary
   */
  async sendDailySummary(): Promise<void> {
    if (!this.snsClient || !this.topicArn) {
      logger.warn('Daily summary would be sent (SNS not configured)');
      return;
    }

    try {
      const activeAlerts = await this.getActiveAlerts();
      
      // Only send summary if there are active alerts or warnings
      if (activeAlerts.length === 0) {
        logger.debug('No active alerts, skipping daily summary');
        return;
      }

      // Group alerts by severity
      const critical = activeAlerts.filter(a => a.severity === AlertSeverity.CRITICAL);
      const warnings = activeAlerts.filter(a => a.severity === AlertSeverity.WARNING);
      const info = activeAlerts.filter(a => a.severity === AlertSeverity.INFO);

      const now = new Date().toISOString();
      let summary = `Mnemora Birthday Bot - Daily Alert Summary\n`;
      summary += `Generated: ${now}\n\n`;

      if (critical.length > 0) {
        summary += `CRITICAL Alerts (${critical.length}):\n`;
        critical.forEach(alert => {
          summary += `  - ${alert.alertId}: Occurred ${alert.count} time(s), first at ${alert.firstOccurred}\n`;
        });
        summary += `\n`;
      }

      if (warnings.length > 0) {
        summary += `WARNING Alerts (${warnings.length}):\n`;
        warnings.forEach(alert => {
          summary += `  - ${alert.alertId}: Occurred ${alert.count} time(s), first at ${alert.firstOccurred}\n`;
        });
        summary += `\n`;
      }

      if (info.length > 0) {
        summary += `INFO Alerts (${info.length}):\n`;
        info.forEach(alert => {
          summary += `  - ${alert.alertId}: Occurred ${alert.count} time(s), first at ${alert.firstOccurred}\n`;
        });
        summary += `\n`;
      }

      summary += `\nView CloudWatch Logs for detailed information.\n`;
      summary += `Resolve alerts by fixing underlying issues - they will be marked as resolved automatically.`;

      const subject = `[INFO] Mnemora Birthday Bot: Daily Alert Summary (${activeAlerts.length} active)`;

      await this.snsClient.send(
        new PublishCommand({
          TopicArn: this.topicArn,
          Subject: subject,
          Message: summary,
          MessageAttributes: {
            Severity: {
              DataType: 'String',
              StringValue: AlertSeverity.INFO,
            },
            AlertType: {
              DataType: 'String',
              StringValue: 'daily-summary',
            },
          },
        })
      );

      logger.info('Daily summary sent', {
        criticalCount: critical.length,
        warningCount: warnings.length,
        infoCount: info.length,
      });
    } catch (error) {
      logger.error('Error sending daily summary', error);
    }
  }
}

/**
 * Global alerting service instance
 */
export const alerting = new AlertingService();

/**
 * Convenience functions for common alerts
 */

export function sendLambdaExecutionFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.LAMBDA_EXECUTION_FAILED,
    severity: AlertSeverity.CRITICAL,
    title: 'Lambda Execution Failed',
    message: 'The Lambda function execution failed with an exception. Check CloudWatch Logs for details.',
    error,
    metadata: context,
    remediationSteps: [
      'Check CloudWatch Logs for error details',
      'Verify correlation ID for tracing',
      'Check Lambda function configuration',
      'Verify IAM permissions',
      'Check environment variables',
    ],
  });
}

export function sendLambdaTimeoutAlert(context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.LAMBDA_TIMEOUT,
    severity: AlertSeverity.CRITICAL,
    title: 'Lambda Execution Timeout',
    message: 'The Lambda function execution exceeded the 15-minute timeout limit.',
    metadata: context,
    remediationSteps: [
      'Check CloudWatch Logs to see where execution timed out',
      'Consider increasing Lambda timeout if needed',
      'Optimize slow operations (API calls, WhatsApp initialization)',
      'Check for infinite loops or blocking operations',
    ],
  });
}

export function sendDailyExecutionMissedAlert(): void {
  alerting.sendAlert({
    type: AlertType.DAILY_EXECUTION_MISSED,
    severity: AlertSeverity.CRITICAL,
    title: 'Daily Execution Missed',
    message: 'No execution detected in the last 25 hours. The scheduled daily check may have failed.',
    remediationSteps: [
      'Check EventBridge rule is enabled',
      'Verify Lambda function is not disabled',
      'Check for Lambda errors in CloudWatch Logs',
      'Verify IAM permissions for EventBridge to invoke Lambda',
      'Manually trigger Lambda function to test',
    ],
  });
}

export function sendMonthlyDigestFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.MONTHLY_DIGEST_FAILED,
    severity: AlertSeverity.CRITICAL,
    title: 'Monthly Digest Not Sent',
    message: 'The monthly digest failed to send on the 1st of the month. This is a critical failure.',
    error,
    metadata: context,
    remediationSteps: [
      'Check WhatsApp authentication status',
      'Verify WhatsApp group ID is correct',
      'Check CloudWatch Logs for send errors',
      'Manually send monthly digest if needed',
      'Verify WhatsApp session is valid',
    ],
  });
}

export function sendGoogleCalendarApiFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.GOOGLE_CALENDAR_API_FAILED,
    severity: AlertSeverity.CRITICAL,
    title: 'Google Calendar API Failed',
    message: 'Failed to fetch birthdays from Google Calendar. This prevents the bot from functioning.',
    error,
    metadata: context,
    remediationSteps: [
      'Verify Google service account credentials are valid',
      'Check calendar ID is correct',
      'Verify service account has calendar access',
      'Check Google Calendar API quota',
      'Verify network connectivity',
    ],
  });
}

export function sendWhatsAppMessageFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.WHATSAPP_MESSAGE_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'WhatsApp Message Send Failed',
    message: 'Failed to send WhatsApp message after retry attempts.',
    error,
    metadata: context,
    remediationSteps: [
      'Check WhatsApp connection status',
      'Verify group ID/name is correct',
      'Check for rate limiting',
      'Re-authenticate WhatsApp if needed',
      'Verify bot account is still in the group',
    ],
  });
}

export function sendWhatsAppAuthRequiredAlert(context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.WHATSAPP_AUTH_REQUIRED,
    severity: AlertSeverity.WARNING,
    title: 'WhatsApp Authentication Required',
    message: 'WhatsApp session expired or missing. QR code authentication is required. Check CloudWatch Logs for QR code.',
    metadata: {
      ...context,
      note: 'QR code is available in CloudWatch Logs. Search for "QR_CODE_FOR_SCANNING" log entry.',
    },
    remediationSteps: [
      'Open CloudWatch Logs for the Lambda function',
      'Find log entry with "QR_CODE_FOR_SCANNING"',
      'Copy the qrCode value',
      'Generate QR code image using the URL in logs',
      'Scan QR code with WhatsApp mobile app',
      'Session will be saved automatically',
    ],
  });
}

export function sendWhatsAppGroupNotFoundAlert(groupName: string, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.WHATSAPP_GROUP_NOT_FOUND,
    severity: AlertSeverity.WARNING,
    title: 'WhatsApp Group Not Found',
    message: `WhatsApp group "${groupName}" was not found. The bot cannot send messages.`,
    metadata: {
      groupName,
      ...context,
    },
    remediationSteps: [
      'Verify group name matches exactly (case-sensitive)',
      'Ensure bot\'s WhatsApp account is in the group',
      'Check group name in WhatsApp settings',
      'Verify WHATSAPP_GROUP_ID environment variable',
    ],
  });
}

export function sendWhatsAppClientInitFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.WHATSAPP_CLIENT_INIT_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'WhatsApp Client Initialization Failed',
    message: 'Failed to initialize WhatsApp client. This may be due to browser launch issues or protocol errors.',
    error,
    metadata: context,
    remediationSteps: [
      'Check Lambda memory and timeout settings',
      'Verify S3 session storage is accessible',
      'Check for browser/Puppeteer errors in logs',
      'Try re-authenticating WhatsApp',
      'Check if session files are corrupted',
    ],
  });
}

export function sendMissedDaysRecoveryFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.MISSED_DAYS_RECOVERY_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'Missed Days Recovery Failed',
    message: 'Failed to recover and send messages for missed days. Main execution will continue.',
    error,
    metadata: context,
    remediationSteps: [
      'Check CloudWatch Logs for specific error',
      'Manually trigger recovery if needed',
      'Fix underlying issue (API, WhatsApp, etc.)',
    ],
  });
}

export function sendS3StorageFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.S3_STORAGE_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'S3 Storage Operation Failed',
    message: 'Failed to read or write to S3 bucket. This affects session persistence and execution tracking.',
    error,
    metadata: context,
    remediationSteps: [
      'Check IAM permissions for S3 access',
      'Verify S3 bucket exists and is in correct region',
      'Check bucket policy allows Lambda access',
      'Verify AWS_REGION environment variable',
    ],
  });
}

export function sendCloudWatchMetricsFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.CLOUDWATCH_METRICS_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'CloudWatch Metrics Flush Failed',
    message: 'Failed to send metrics to CloudWatch. Monitoring may be incomplete.',
    error,
    metadata: context,
    remediationSteps: [
      'Check IAM permissions for CloudWatch Metrics',
      'Verify region configuration',
      'Check CloudWatch service status',
    ],
  });
}

export function sendWhatsAppAuthRefreshNeededAlert(daysSinceAuth: number | null, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.WHATSAPP_AUTH_REFRESH_NEEDED,
    severity: AlertSeverity.INFO,
    title: 'WhatsApp Auth Refresh Recommended',
    message: `WhatsApp authentication is ${daysSinceAuth ? `${daysSinceAuth} days` : 'never'} old. Consider refreshing before session expires.`,
    metadata: {
      daysSinceAuth,
      ...context,
    },
    remediationSteps: [
      'Proactively re-authenticate before session expires',
      'Check CloudWatch Logs for QR code when needed',
      'Session typically expires after 7 days',
    ],
  });
}

export function sendHighExecutionDurationAlert(durationMs: number, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.HIGH_EXECUTION_DURATION,
    severity: AlertSeverity.INFO,
    title: 'High Execution Duration',
    message: `Execution took ${Math.round(durationMs / 1000)} seconds, which is longer than expected.`,
    metadata: {
      durationMs,
      durationSeconds: Math.round(durationMs / 1000),
      ...context,
    },
    remediationSteps: [
      'Check CloudWatch Logs for slow operations',
      'Optimize API calls (batch requests)',
      'Check for network timeouts',
      'Consider increasing Lambda timeout if needed',
    ],
  });
}

export function sendApiQuotaWarningAlert(service: 'calendar' | 'sheets', usagePercent: number, context?: Record<string, unknown>): void {
  alerting.sendAlert({
    type: AlertType.API_QUOTA_WARNING,
    severity: AlertSeverity.INFO,
    title: 'API Quota Warning',
    message: `Google ${service} API quota usage is at ${usagePercent}%. Consider optimizing API calls.`,
    metadata: {
      service,
      usagePercent,
      ...context,
    },
    remediationSteps: [
      'Optimize API calls (batch requests, reduce frequency)',
      'Request quota increase from Google if needed',
      'Monitor API usage in Google Cloud Console',
    ],
  });
}

