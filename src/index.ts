import { runBirthdayCheck } from './services/birthday-orchestrator.service.js';
import { logger } from './utils/logger.util.js';
import { config } from './config.js';
import GoogleCalendarClient from './clients/google-calendar.client.js';
import whatsappClient from './clients/whatsapp.client.js';
import { setCorrelationId } from './utils/runtime.util.js';

async function main(): Promise<void> {
  // Generate a correlation ID for local execution
  const correlationId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  setCorrelationId(correlationId);

  logger.info('Birthday check started', {
    environment: 'local',
    correlationId,
  });

  try {
    const calendarClient = new GoogleCalendarClient(config);

    await runBirthdayCheck({
      logger,
      config,
      calendarClient,
      whatsappClient,
    });

    logger.info('Birthday check completed successfully', {
      correlationId,
    });

    process.exit(0);
  } catch (error) {
    logger.error('Birthday check failed', error, {
      correlationId,
    });

    process.exit(1);
  }
}

main();
