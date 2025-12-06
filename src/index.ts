import { runBirthdayCheck } from './services/birthday-orchestrator.service.js';
import { AlertingService } from './services/alerting.service.js';
import { MetricsCollector } from './services/metrics.service.js';
import { logger } from './utils/logger.util.js';
import { config } from './config.js';
import GoogleCalendarClient from './clients/google-calendar.client.js';
import xrayClient from './clients/xray.client.js';
import cloudWatchClient from './clients/cloudwatch.client.js';
import whatsappClient from './clients/whatsapp.client.js';
import snsClient from './clients/sns.client.js';
import { setCorrelationId } from './utils/runtime.util.js';

async function main(): Promise<void> {
  // Generate a correlation ID for local execution
  const correlationId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  setCorrelationId(correlationId);

  logger.info('Birthday check started', {
    environment: 'local',
    correlationId,
  });

  const alerting = new AlertingService({ logger, config, snsClient });
  const metrics = new MetricsCollector({ logger, config, cloudWatchClient, alerting });

  try {
    const calendarClient = new GoogleCalendarClient(config, xrayClient);
    
    await runBirthdayCheck({
      logger,
      config,
      calendarClient,
      xrayClient,
      cloudWatchClient,
      whatsappClient,
      alerting,
    });

    logger.info('Birthday check completed successfully', {
      correlationId,
    });

    await metrics.flush();

    process.exit(0);
  } catch (error) {
    logger.error('Birthday check failed', error, {
      correlationId,
    });

    // Send alert if configured
    if (error instanceof Error) {
      alerting.sendLambdaExecutionFailedAlert(error, {
        requestId: correlationId,
        functionName: 'mnemora-birthday-bot-local',
        remainingTime: 0,
      });
    }

    try {
      await metrics.flush();
    } catch (flushError) {
      logger.error('Error flushing metrics', flushError);
    }

    process.exit(1);
  }
}

main();

