import dotenv from 'dotenv';
import { DynamicConfigService } from './services/dynamic-config.service.js';
import type { AppContext } from './app-context.js';

dotenv.config();

export interface GoogleConfig {
  calendarId: string;
  spreadsheetId: string | undefined;
  clientEmail: string | undefined;
  privateKey: string | undefined;
  projectId: string | undefined;
}

export interface WhatsAppConfig {
  groupId: string | undefined;
}

export interface ScheduleConfig {
  time: string;
  timezone: string;
}

export interface AWSConfig {
  region: string;
  s3Bucket: string | undefined;
  snsTopicArn: string | undefined;
  cloudWatchLogGroup: string | undefined;
  enableXRay: boolean;
}

export interface AppConfig {
  google: GoogleConfig;
  whatsapp: WhatsAppConfig;
  schedule: ScheduleConfig;
  aws: AWSConfig;
  metrics: {
    namespace: string;
    enabled: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  environment: string;
}

// Cache for dynamic config values loaded from Parameter Store
let dynamicConfigCache: {
  whatsapp?: { groupId?: string };
  schedule?: { time?: string; timezone?: string };
  logging?: { level?: string };
  google?: { spreadsheetId?: string };
} | null = null;

/**
 * Processes the Google private key from environment variable.
 * Handles both base64-encoded keys (from CloudFormation) and raw PEM keys (from .env).
 */
function processPrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) {
    return undefined;
  }

  // First, replace escaped newlines (for .env files)
  let key = rawKey.replace(/\\n/g, '\n');

  // If the key doesn't start with "-----BEGIN", it's likely base64-encoded
  // This happens when passed through CloudFormation parameters
  if (!key.startsWith('-----BEGIN')) {
    try {
      // Decode base64 to get the actual PEM key
      key = Buffer.from(key, 'base64').toString('utf-8');
    } catch (error) {
      // If decoding fails, assume it's already in the correct format
      console.warn('Failed to decode private key as base64, using as-is');
    }
  }

  return key;
}

/**
 * Loads dynamic configuration from Parameter Store.
 * Should be called at the start of each Lambda invocation.
 */
export async function loadDynamicConfig(ctx: AppContext): Promise<void> {
  const dynamicConfig = new DynamicConfigService(ctx.logger);
  
  try {
    const params = await dynamicConfig.getParameters({
      whatsapp: ['groupId'],
      schedule: ['time', 'timezone'],
      logging: ['level'],
      google: ['spreadsheetId'],
    });

    dynamicConfigCache = {
      whatsapp: {
        groupId: params['whatsapp.groupId'] ?? undefined,
      },
      schedule: {
        time: params['schedule.time'] ?? undefined,
        timezone: params['schedule.timezone'] ?? undefined,
      },
      logging: {
        level: params['logging.level'] ?? undefined,
      },
      google: {
        spreadsheetId: params['google.spreadsheetId'] ?? undefined,
      },
    };

    ctx.logger.info('Dynamic config loaded from Parameter Store', {
      whatsappGroupId: dynamicConfigCache.whatsapp?.groupId ? '***' : undefined,
      scheduleTime: dynamicConfigCache.schedule?.time,
      timezone: dynamicConfigCache.schedule?.timezone,
      logLevel: dynamicConfigCache.logging?.level,
      hasSpreadsheetId: !!dynamicConfigCache.google?.spreadsheetId,
    });
  } catch (error) {
    ctx.logger.error('Failed to load dynamic config from Parameter Store', error);
    // Continue with empty cache - will use defaults
    dynamicConfigCache = {};
  }
}

export const config: AppConfig = {
  google: {
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    get spreadsheetId(): string | undefined {
      return dynamicConfigCache?.google?.spreadsheetId ?? process.env.GOOGLE_SPREADSHEET_ID;
    },
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: processPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    projectId: process.env.GOOGLE_PROJECT_ID,
  },
  whatsapp: {
    get groupId(): string | undefined {
      return dynamicConfigCache?.whatsapp?.groupId ?? process.env.WHATSAPP_GROUP_ID;
    },
  },
  schedule: {
    get time(): string {
      return dynamicConfigCache?.schedule?.time ?? process.env.SCHEDULE_TIME ?? '09:00';
    },
    get timezone(): string {
      return dynamicConfigCache?.schedule?.timezone ?? process.env.TIMEZONE ?? process.env.TZ ?? 'America/Los_Angeles';
    },
  },
  aws: {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-1',
    s3Bucket: process.env.AWS_S3_BUCKET,
    snsTopicArn: process.env.SNS_TOPIC_ARN,
    cloudWatchLogGroup: process.env.AWS_CLOUDWATCH_LOG_GROUP,
    enableXRay: process.env.AWS_XRAY_ENABLED !== 'false',
  },
  metrics: {
    namespace: process.env.METRICS_NAMESPACE || 'Mnemora/BirthdayBot',
    enabled: process.env.ENABLE_CLOUDWATCH_METRICS !== 'false',
  },
  logging: {
    get level(): string {
      return dynamicConfigCache?.logging?.level ?? process.env.LOG_LEVEL ?? 'info';
    },
    pretty: process.env.NODE_ENV === 'development',
  },
  environment: process.env.NODE_ENV || 'development',
};

