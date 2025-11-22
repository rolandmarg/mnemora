import { runBirthdayCheck } from './services/birthday-orchestrator.service.js';
import { logger } from './utils/logger.util.js';
import { config } from './config.js';
import calendarClient from './clients/google-calendar.client.js';
import xrayClient from './clients/xray.client.js';
import cloudWatchMetricsClient from './clients/cloudwatch.client.js';

async function main(): Promise<void> {
  try {
    await runBirthdayCheck(logger, config, calendarClient, xrayClient, cloudWatchMetricsClient);
    logger.info('Birthday check completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Birthday check failed', error);
    process.exit(1);
  }
}

main();

