import { runBirthdayCheck } from './services/birthday-orchestrator.service.js';
import { AlertingService } from './services/alerting.service.js';
import { logger } from './utils/logger.util.js';
import { config } from './config.js';
import GoogleCalendarClient from './clients/google-calendar.client.js';
import xrayClient from './clients/xray.client.js';
import cloudWatchMetricsClient from './clients/cloudwatch.client.js';
import whatsappClient from './clients/whatsapp.client.js';
import snsClient from './clients/sns.client.js';

async function main(): Promise<void> {
  try {
    const calendarClient = new GoogleCalendarClient(config, xrayClient);
    const alerting = new AlertingService({ logger, config, snsClient });
    
    await runBirthdayCheck({
      logger,
      config,
      calendarClient,
      xrayClient,
      cloudWatchClient: cloudWatchMetricsClient,
      whatsappClient,
      alerting,
    });
    logger.info('Birthday check completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Birthday check failed', error);
    process.exit(1);
  }
}

main();

