import { getCorrelationId, getLambdaFunctionName, isLambda } from '../utils/runtime.util.js';
import { AlertSeverity, AlertType } from '../types/alerting.types.js';
import { StorageService } from './storage.service.js';
import type { Logger } from '../types/logger.types.js';
import type { AppConfig } from '../config.js';
import type { AlertState, AlertDetails } from '../types/alerting.types.js';
import snsClientDefault from '../clients/sns.client.js';
import { createTwilioClient, type TwilioClientWrapper } from '../clients/twilio.client.js';
import { formatTimestampHumanReadable } from '../utils/date-helpers.util.js';

type SNSClient = typeof snsClientDefault;

interface ActiveAlerts {
  [alertId: string]: AlertState;
}

interface AlertingServiceOptions {
  logger: Logger;
  config: AppConfig;
  snsClient: SNSClient;
  twilioClient?: TwilioClientWrapper;
}

function getCloudWatchLogsUrl(config: AppConfig): string | undefined {
  if (!isLambda()) {
    return undefined;
  }

  const functionName = getLambdaFunctionName();
  const region = config.aws.region;
  const requestId = getCorrelationId();

  if (functionName && requestId) {
    return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodeURIComponent(`/aws/lambda/${functionName}`)}/log-events/${encodeURIComponent(requestId)}`;
  }

  return undefined;
}

export class AlertingService {
  private readonly logger: Logger;
  private readonly config: AppConfig;
  private readonly snsClient: SNSClient;
  private readonly twilioClient: TwilioClientWrapper | undefined;
  private readonly topicArn: string | undefined;
  private readonly storage = StorageService.getAppStorage();
  private readonly alertStateKey = 'alerts/active-alerts.json';
  private readonly deduplicationWindowMs = 60 * 60 * 1000;

  constructor(options: AlertingServiceOptions) {
    const { logger, config, snsClient, twilioClient } = options;
    this.logger = logger;
    this.config = config;
    this.snsClient = snsClient;
    // Initialize Twilio client only if credentials are provided
    // Wrap in try-catch to ensure initialization failures don't break the alerting service
    if (twilioClient) {
      this.twilioClient = twilioClient;
    } else if (config.twilio.accountSid) {
      try {
        this.twilioClient = createTwilioClient(logger);
      } catch (error) {
        // Log but don't throw - Twilio is optional
        logger.warn('Failed to initialize Twilio client for alerting', error);
        this.twilioClient = undefined;
      }
    } else {
      this.twilioClient = undefined;
    }
    this.topicArn = config.aws.snsTopicArn;
  }

  private async loadActiveAlerts(): Promise<ActiveAlerts> {
    try {
      if (isLambda()) {
        const data = await this.storage.readFile(this.alertStateKey);
        if (data) {
          return JSON.parse(data.toString('utf-8')) as ActiveAlerts;
        }
      }
      return {};
    } catch (error) {
      this.logger.warn('Error loading active alerts, starting fresh', error);
      return {};
    }
  }

  private async saveActiveAlerts(alerts: ActiveAlerts): Promise<void> {
    try {
      if (isLambda()) {
        // Clean up resolved alerts older than 30 days
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        
        for (const [alertId, alert] of Object.entries(alerts)) {
          if (alert.resolved && alert.resolvedAt) {
            const resolvedAt = new Date(alert.resolvedAt).getTime();
            if (resolvedAt < thirtyDaysAgo) {
              delete alerts[alertId];
              this.logger.debug('Removed old resolved alert', {
                alertId,
                resolvedAt: alert.resolvedAt,
              });
            }
          }
        }

        const data = JSON.stringify(alerts, null, 2);
        await this.storage.writeFile(this.alertStateKey, data);
      }
    } catch (error) {
      this.logger.error('Error saving active alerts', error);
    }
  }

  private shouldSendAlert(alertState: AlertState | undefined, now: Date): boolean {
    if (!alertState) {
      return true;
    }

    if (alertState.resolved) {
      return true;
    }

    if (alertState.lastSent) {
      const lastSentTime = new Date(alertState.lastSent).getTime();
      const timeSinceLastSent = now.getTime() - lastSentTime;
      
      if (timeSinceLastSent < this.deduplicationWindowMs) {
        return false;
      }
    }

    return true;
  }

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

  async resolveAlert(alertId: string): Promise<void> {
    try {
      const alerts = await this.loadActiveAlerts();
      const alert = alerts[alertId];

      if (alert && !alert.resolved) {
        alert.resolved = true;
        alert.resolvedAt = new Date().toISOString();
        await this.saveActiveAlerts(alerts);
        this.logger.info('Alert resolved', { alertId, resolvedAt: alert.resolvedAt });
      }
    } catch (error) {
      this.logger.error('Error resolving alert', error);
    }
  }

  private formatSMSMessage(details: AlertDetails, alertState: AlertState): string {
    const now = new Date();
    const timeStr = formatTimestampHumanReadable(now);
    
    // Extract key info for SMS - keep it under 160 chars if possible
    let sms = `🚨 ${details.title}\n`;
    sms += `${details.message}`;
    
    // Add error if present (truncate if too long)
    if (details.error) {
      const errorMessage = details.error instanceof Error 
        ? details.error.message 
        : String(details.error);
      // Truncate error to 50 chars max for SMS
      const shortError = errorMessage.length > 50 
        ? `${errorMessage.substring(0, 47)}...`
        : errorMessage;
      sms += `\nError: ${shortError}`;
    }
    
    // Add count if multiple occurrences
    if (alertState.count > 1) {
      sms += `\n(Occurred ${alertState.count}x)`;
    }
    
    // Add time at the end
    sms += `\n${timeStr}`;
    
    return sms;
  }

  private formatAlertMessage(details: AlertDetails, alertState: AlertState): string {
    const correlationId = getCorrelationId();
    const logsUrl = getCloudWatchLogsUrl(this.config);
    const now = new Date();

    let message = `[${details.severity}] ${details.title}\n\n`;
    message += `Time: ${formatTimestampHumanReadable(now)}\n`;
    
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
      message += `${Object.entries(details.metadata)
        .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
        .join('\n')  }\n`;
    }

    if (alertState.count > 1) {
      message += `\nThis alert has occurred ${alertState.count} time(s) since ${formatTimestampHumanReadable(alertState.firstOccurred)}\n`;
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

  async sendAlert(details: AlertDetails): Promise<void> {
    if (!this.snsClient.isAvailable() || !this.topicArn) {
      this.logger.warn('Alert would be sent (SNS not configured)', {
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

      if (!this.shouldSendAlert(alertState, now)) {
        this.logger.debug('Alert deduplicated (sent recently)', {
          alertId,
          lastSent: alertState.lastSent,
        });
        await this.saveActiveAlerts(alerts);
        return;
      }

      const message = this.formatAlertMessage(details, alertState);
      const subject = `[${details.severity}] Mnemora Birthday Bot: ${details.title}`;

      const sendSMS = details.severity === AlertSeverity.CRITICAL;
      console.log(`[DEBUG] sendSMS=${sendSMS}, twilioClient available=${this.twilioClient?.isAvailable() ?? false}`);

      // Send via SNS (for email and potentially SMS if configured)
      await this.snsClient.publishAlert(subject, message, details.severity, details.type, sendSMS);

      // Send SMS via Twilio if configured and SMS is requested
      console.log(`[DEBUG] About to check SMS: sendSMS=${sendSMS}, twilioAvailable=${this.twilioClient?.isAvailable() ?? false}`);
      if (sendSMS && this.twilioClient?.isAvailable()) {
        console.log(`[DEBUG] Entering SMS sending block`);
        try {
          const smsMessage = this.formatSMSMessage(details, alertState);
          this.logger.info('Attempting to send SMS via Twilio', {
            type: details.type,
            severity: details.severity,
            alertId,
          });
          const smsSid = await this.twilioClient.sendSMS(smsMessage);
          this.logger.info('SMS sent via Twilio', {
            type: details.type,
            severity: details.severity,
            alertId,
            smsSid,
          });
          console.log(`✅ SMS sent via Twilio! Message SID: ${smsSid}`);
        } catch (error) {
          this.logger.error('Error sending SMS via Twilio', error, {
            type: details.type,
            severity: details.severity,
            alertId,
          });
          console.error('❌ Error sending SMS via Twilio:', error);
          // Don't fail the entire alert if SMS fails
        }
      } else if (sendSMS) {
        this.logger.warn('SMS requested but Twilio not available', {
          type: details.type,
          severity: details.severity,
          alertId,
          twilioAvailable: this.twilioClient?.isAvailable() ?? false,
        });
        console.warn('⚠️  SMS requested but Twilio client not available');
      }

      this.logger.info('Alert sent via SNS', {
        type: details.type,
        severity: details.severity,
        alertId,
        count: alertState.count,
        smsSent: sendSMS && this.twilioClient?.isAvailable(),
      });

      await this.saveActiveAlerts(alerts);
    } catch (error) {
      this.logger.error('Error sending alert via SNS', error, {
        type: details.type,
        severity: details.severity,
      });
    }
  }

  async getActiveAlerts(): Promise<AlertState[]> {
    try {
      const alerts = await this.loadActiveAlerts();
      return Object.values(alerts).filter(alert => !alert.resolved);
    } catch (error) {
      this.logger.error('Error getting active alerts', error);
      return [];
    }
  }

  async sendDailySummary(): Promise<void> {
    if (!this.snsClient.isAvailable() || !this.topicArn) {
      this.logger.warn('Daily summary would be sent (SNS not configured)');
      return;
    }

    try {
      const activeAlerts = await this.getActiveAlerts();

      if (activeAlerts.length === 0) {
        this.logger.debug('No active alerts for daily summary');
        return;
      }

      const critical = activeAlerts.filter(a => a.severity === AlertSeverity.CRITICAL);
      const warnings = activeAlerts.filter(a => a.severity === AlertSeverity.WARNING);
      const info = activeAlerts.filter(a => a.severity === AlertSeverity.INFO);

      let summary = '📊 Daily Alert Summary\n\n';
      summary += `Total Active Alerts: ${activeAlerts.length}\n\n`;

      if (critical.length > 0) {
        summary += `🚨 CRITICAL (${critical.length}):\n`;
        critical.forEach(alert => {
          summary += `  - ${alert.alertId}: ${alert.count} occurrence(s) since ${formatTimestampHumanReadable(alert.firstOccurred)}\n`;
        });
        summary += '\n';
      }

      if (warnings.length > 0) {
        summary += `⚠️  WARNING (${warnings.length}):\n`;
        warnings.forEach(alert => {
          summary += `  - ${alert.alertId}: ${alert.count} occurrence(s) since ${formatTimestampHumanReadable(alert.firstOccurred)}\n`;
        });
        summary += '\n';
      }

      if (info.length > 0) {
        summary += `ℹ️  INFO (${info.length}):\n`;
        info.forEach(alert => {
          summary += `  - ${alert.alertId}: ${alert.count} occurrence(s) since ${formatTimestampHumanReadable(alert.firstOccurred)}\n`;
        });
        summary += '\n';
      }

      summary += 'View details in CloudWatch Logs or AWS Console.\n';

      const subject = `[INFO] Mnemora Birthday Bot: Daily Alert Summary (${activeAlerts.length} active)`;
      await this.snsClient.publishAlert(subject, summary, AlertSeverity.INFO, 'daily-summary', false);

      this.logger.info('Daily alert summary sent', { alertCount: activeAlerts.length });
    } catch (error) {
      this.logger.error('Error sending daily alert summary', error);
    }
  }

  sendLambdaExecutionFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
    this.sendAlert({
    type: AlertType.LAMBDA_EXECUTION_FAILED,
    severity: AlertSeverity.CRITICAL,
    title: 'Lambda Execution Failed',
    message: 'The Lambda function failed to execute. Check logs for details.',
    error,
    metadata: context,
    remediationSteps: [
      'Check CloudWatch Logs for error details',
      'Verify all environment variables are set correctly',
      'Check IAM permissions for Lambda execution role',
      'Verify external service availability (Google Calendar, WhatsApp)',
      'Check Lambda timeout and memory settings',
    ],
  });
}

  sendLambdaTimeoutAlert(context?: Record<string, unknown>): void {
    this.sendAlert({
    type: AlertType.LAMBDA_TIMEOUT,
    severity: AlertSeverity.CRITICAL,
    title: 'Lambda Execution Timeout',
    message: 'The Lambda function exceeded its timeout limit and was terminated.',
    metadata: context,
    remediationSteps: [
      'Increase Lambda timeout in infrastructure/template.yaml',
      'Optimize slow operations (API calls, WhatsApp initialization)',
      'Check for infinite loops or blocking operations',
      'Consider breaking into multiple Lambda functions',
      'Check CloudWatch Logs for where execution stopped',
    ],
  });
}


  sendMonthlyDigestFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
    this.sendAlert({
    type: AlertType.MONTHLY_DIGEST_FAILED,
    severity: AlertSeverity.CRITICAL,
    title: 'Monthly Digest Failed',
    message: 'Failed to send monthly birthday digest on the 1st of the month.',
    error,
    metadata: context,
    remediationSteps: [
      'Check CloudWatch Logs for error details',
      'Verify WhatsApp authentication is valid',
      'Check WhatsApp group ID is correct',
      'Verify Google Calendar API access',
      'Manually trigger monthly digest if needed',
    ],
  });
}

  sendGoogleCalendarApiFailedAlert(
    error: Error | unknown,
    context?: Record<string, unknown>
  ): void {
    this.sendAlert({
    type: AlertType.GOOGLE_CALENDAR_API_FAILED,
    severity: AlertSeverity.CRITICAL,
    title: 'Google Calendar API Failed',
    message: 'Failed to communicate with Google Calendar API. Birthday data cannot be fetched.',
    error,
    metadata: context,
    remediationSteps: [
      'Verify Google Calendar API credentials are valid',
      'Check service account has access to calendar',
      'Verify calendar ID is correct',
      'Check Google Cloud project API quotas',
      'Verify network connectivity to Google APIs',
      'Check for API key expiration',
    ],
  });
}

  sendWhatsAppMessageFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
    this.sendAlert({
    type: AlertType.WHATSAPP_MESSAGE_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'WhatsApp Message Failed',
    message: 'Failed to send message to WhatsApp group. Birthday notification was not delivered.',
    error,
    metadata: context,
    remediationSteps: [
      'Check WhatsApp authentication status',
      'Verify group ID/name is correct',
      'Check for rate limiting',
      'Re-authenticate WhatsApp if needed',
      'Verify bot account is still in the group',
    ],
  });
}

  sendWhatsAppAuthRequiredAlert(context?: Record<string, unknown>): void {
    // Fire and forget - sendAlert is async but we don't need to wait
    void this.sendAlert({
    type: AlertType.WHATSAPP_AUTH_REQUIRED,
    severity: AlertSeverity.CRITICAL,
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

  sendWhatsAppGroupNotFoundAlert(groupName: string, context?: Record<string, unknown>): void {
    this.sendAlert({
    type: AlertType.WHATSAPP_GROUP_NOT_FOUND,
    severity: AlertSeverity.WARNING,
    title: 'WhatsApp Group Not Found',
    message: `WhatsApp group "${groupName}" was not found. Birthday messages cannot be sent.`,
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

  sendWhatsAppClientInitFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
    this.sendAlert({
    type: AlertType.WHATSAPP_CLIENT_INIT_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'WhatsApp Client Initialization Failed',
    message: 'Failed to initialize WhatsApp client. This may be due to browser launch issues or session corruption.',
    error,
    metadata: context,
    remediationSteps: [
      'Check Lambda memory and timeout settings',
      'Verify S3 session storage is accessible',
      'Check for connection errors in logs',
      'Try re-authenticating WhatsApp',
      'Check if session files are corrupted',
    ],
  });
}


  sendCloudWatchMetricsFailedAlert(error: Error | unknown, context?: Record<string, unknown>): void {
    this.sendAlert({
    type: AlertType.CLOUDWATCH_METRICS_FAILED,
    severity: AlertSeverity.WARNING,
    title: 'CloudWatch Metrics Failed',
    message: 'Failed to send metrics to CloudWatch. Monitoring data may be incomplete.',
    error,
    metadata: context,
    remediationSteps: [
      'Check IAM permissions for CloudWatch Metrics',
      'Verify METRICS_NAMESPACE environment variable',
      'Check for API quota limits',
      'Verify network connectivity',
    ],
  });
}

  sendWhatsAppAuthRefreshNeededAlert(daysSinceAuth: number | null, context?: Record<string, unknown>): void {
    this.sendAlert({
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

  sendHighExecutionDurationAlert(durationMs: number, context?: Record<string, unknown>): void {
    this.sendAlert({
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

  sendApiQuotaWarningAlert(service: 'calendar' | 'sheets', usagePercent: number, context?: Record<string, unknown>): void {
    this.sendAlert({
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

}

