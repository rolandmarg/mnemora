import { logger } from './utils/logger.util.js';
import { config } from './config.js';
import s3Client from './clients/s3.client.js';
import snsClient from './clients/sns.client.js';
import whatsappClient from './clients/whatsapp.client.js';
import cloudWatchMetricsClient from './clients/cloudwatch.client.js';
import calendarClient from './clients/google-calendar.client.js';
import sheetsClient from './clients/google-sheets.client.js';
import type { Logger } from './types/logger.types.js';
import type { AppConfig } from './config.js';

export interface AppContext {
  logger: Logger;
  config: AppConfig;
  isLambda: boolean;
  environment: string;
  isProduction: boolean;
  clients: {
    s3: typeof s3Client;
    sns: typeof snsClient;
    whatsapp: typeof whatsappClient;
    cloudWatch: typeof cloudWatchMetricsClient;
    calendar: typeof calendarClient;
    sheets: typeof sheetsClient;
  };
}

let appContextInstance: AppContext | null = null;

export function createAppContext(): AppContext {
  if (appContextInstance) {
    return appContextInstance;
  }

  const isLambda = !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
  const environment = process.env.NODE_ENV ?? 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  appContextInstance = {
    logger,
    config,
    isLambda,
    environment,
    isProduction,
    clients: {
      s3: s3Client,
      sns: snsClient,
      whatsapp: whatsappClient,
      cloudWatch: cloudWatchMetricsClient,
      calendar: calendarClient,
      sheets: sheetsClient,
    },
  };

  return appContextInstance;
}

export const appContext = createAppContext();

