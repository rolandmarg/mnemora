export enum AlertSeverity {
  CRITICAL = 'CRITICAL',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

export enum AlertType {
  LAMBDA_EXECUTION_FAILED = 'lambda-execution-failed',
  LAMBDA_TIMEOUT = 'lambda-timeout',
  DAILY_EXECUTION_MISSED = 'daily-execution-missed',
  MONTHLY_DIGEST_FAILED = 'monthly-digest-failed',
  GOOGLE_CALENDAR_API_FAILED = 'google-calendar-api-failed',
  
  WHATSAPP_MESSAGE_FAILED = 'whatsapp-message-failed',
  WHATSAPP_AUTH_REQUIRED = 'whatsapp-auth-required',
  WHATSAPP_GROUP_NOT_FOUND = 'whatsapp-group-not-found',
  WHATSAPP_CLIENT_INIT_FAILED = 'whatsapp-client-init-failed',
  MISSED_DAYS_RECOVERY_FAILED = 'missed-days-recovery-failed',
  S3_STORAGE_FAILED = 's3-storage-failed',
  CLOUDWATCH_METRICS_FAILED = 'cloudwatch-metrics-failed',
  
  WHATSAPP_AUTH_REFRESH_NEEDED = 'whatsapp-auth-refresh-needed',
  HIGH_EXECUTION_DURATION = 'high-execution-duration',
  API_QUOTA_WARNING = 'api-quota-warning',
}

export interface AlertState {
  alertId: string;
  severity: AlertSeverity;
  firstOccurred: string;
  lastOccurred: string;
  count: number;
  resolved: boolean;
  resolvedAt?: string;
  lastSent?: string;
}

export interface AlertDetails {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  error?: Error | unknown;
  metadata?: Record<string, unknown>;
  remediationSteps?: string[];
}

