import dotenv from 'dotenv';

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
  timezone: string;
}

export interface AWSConfig {
  region: string;
  s3Bucket: string | undefined;
}

export interface TwilioConfig {
  accountSid: string | undefined;
  authToken: string | undefined;
  fromNumber: string | undefined;
  toNumber: string | undefined;
}

export interface AppConfig {
  google: GoogleConfig;
  whatsapp: WhatsAppConfig;
  schedule: ScheduleConfig;
  aws: AWSConfig;
  twilio: TwilioConfig;
  logging: {
    level: string;
  };
  environment: string;
}

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
    } catch (_error) {
      // If decoding fails, assume it's already in the correct format
      console.warn('Failed to decode private key as base64, using as-is');
    }
  }

  return key;
}

export const config: AppConfig = {
  google: {
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? 'primary',
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: processPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    projectId: process.env.GOOGLE_PROJECT_ID,
  },
  whatsapp: {
    groupId: process.env.WHATSAPP_GROUP_ID,
  },
  schedule: {
    timezone: process.env.TIMEZONE ?? process.env.TZ ?? 'America/Los_Angeles',
  },
  aws: {
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-west-1',
    s3Bucket: process.env.AWS_S3_BUCKET,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    toNumber: process.env.TWILIO_TO_NUMBER,
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  environment: process.env.NODE_ENV ?? 'development',
};

