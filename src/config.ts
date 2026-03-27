export interface GoogleConfig {
  spreadsheetId: string;
  clientEmail: string | undefined;
  privateKey: string | undefined;
  projectId: string | undefined;
}

export interface WhatsAppConfig {
  groupName: string | undefined;
  healthCheckGroupName: string | undefined;
}

export interface ScheduleConfig {
  timezone: string;
}

export interface AppConfig {
  google: GoogleConfig;
  whatsapp: WhatsAppConfig;
  schedule: ScheduleConfig;
  logging: {
    level: string;
  };
}

/**
 * Normalizes the Google private key from environment variable.
 * Handles escaped newlines from env files (e.g. literal \n -> actual newlines).
 */
function normalizePrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) {
    return undefined;
  }
  return rawKey.replace(/\\n/g, '\n');
}

export const config: AppConfig = {
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? '',
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    projectId: process.env.GOOGLE_PROJECT_ID,
  },
  whatsapp: {
    groupName: process.env.WHATSAPP_GROUP_NAME,
    healthCheckGroupName: process.env.WHATSAPP_HEALTH_CHECK_GROUP_NAME,
  },
  schedule: {
    timezone: 'America/Los_Angeles',
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
};
