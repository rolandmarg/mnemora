/**
 * Local Execution Entry Point
 * 
 * Manual execution mode - runs once and exits.
 * Scheduling is disabled. Run manually with: yarn start or yarn dev
 */

import { runBirthdayCheck } from './index-core.js';
import { logger } from './utils/logger.js';

/**
 * Main entry point for local execution
 */
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

// Run the check
main();

