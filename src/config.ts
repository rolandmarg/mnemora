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
  headless: boolean;
}

export interface ScheduleConfig {
  time: string;
  timezone: string;
}

export interface AWSConfig {
  region: string | undefined;
  s3Bucket: string | undefined;
  cloudWatchLogGroup: string | undefined;
  enableXRay: boolean;
}

export interface AppConfig {
  google: GoogleConfig;
  whatsapp: WhatsAppConfig;
  schedule: ScheduleConfig;
  aws: AWSConfig;
}

export const config: AppConfig = {
  google: {
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    projectId: process.env.GOOGLE_PROJECT_ID,
  },
  whatsapp: {
    groupId: process.env.WHATSAPP_GROUP_ID,
    headless: process.env.WHATSAPP_HEADLESS === 'true',
  },
  schedule: {
    time: process.env.SCHEDULE_TIME || '09:00',
    timezone: process.env.TIMEZONE || process.env.TZ || 'America/Los_Angeles',
  },
  aws: {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
    s3Bucket: process.env.AWS_S3_BUCKET,
    cloudWatchLogGroup: process.env.AWS_CLOUDWATCH_LOG_GROUP,
    enableXRay: process.env.AWS_XRAY_ENABLED !== 'false',
  },
};

