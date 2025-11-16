import { runBirthdayCheck } from './services/birthday-orchestrator.service.js';
import { logger } from './clients/logger.client.js';

async function main(): Promise<void> {
  try {
    await runBirthdayCheck();
    logger.info('Birthday check completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Birthday check failed', error);
    process.exit(1);
  }
}

main();

