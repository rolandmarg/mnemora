import { runBirthdayCheck } from './services/birthday-orchestrator.service.js';
import { appContext } from './app-context.js';

async function main(): Promise<void> {
  try {
    await runBirthdayCheck(appContext);
    appContext.logger.info('Birthday check completed successfully');
    process.exit(0);
  } catch (error) {
    appContext.logger.error('Birthday check failed', error);
    process.exit(1);
  }
}

main();

