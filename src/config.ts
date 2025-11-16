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
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV === 'development',
  },
  environment: process.env.NODE_ENV || 'development',
};

