import dotenv from 'dotenv';

dotenv.config();

export interface GoogleConfig {
  calendarId: string;
  clientEmail: string | undefined;
  privateKey: string | undefined;
  projectId: string | undefined;
}

export interface WhatsAppConfig {
  groupId: string | undefined;
}

export interface ScheduleConfig {
  time: string;
}

export interface AppConfig {
  google: GoogleConfig;
  whatsapp: WhatsAppConfig;
  schedule: ScheduleConfig;
}

export const config: AppConfig = {
  google: {
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    projectId: process.env.GOOGLE_PROJECT_ID,
  },
  whatsapp: {
    groupId: process.env.WHATSAPP_GROUP_ID,
  },
  schedule: {
    time: process.env.SCHEDULE_TIME || '09:00',
  },
};

