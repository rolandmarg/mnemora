/**
 * Delete Events Script - DISABLED FOR SECURITY
 * 
 * This script has been disabled for security reasons.
 * Deletion of birthday events is not allowed to prevent unauthorized data loss.
 */

import { logger } from '../utils/logger.js';
import { auditDeletionAttempt } from '../utils/security.js';

/**
 * Main function - exits immediately with security error
 */
async function main(): Promise<void> {
  // Audit log the attempt
  auditDeletionAttempt('delete-events.ts', {
    script: 'delete-events',
    args: process.argv.slice(2),
  });

  logger.error('SECURITY: Deletion script is disabled', {
    reason: 'Deletion of birthday events is disabled for security reasons',
    script: 'delete-events.ts',
  });

  console.error('\n❌ SECURITY ERROR: Deletion is disabled\n');
  console.error('Deletion of birthday events has been disabled for security reasons.');
  console.error('This prevents unauthorized deletion of birthday data.\n');
  console.error('If you need to delete events, you must do so manually through Google Calendar.\n');
  
  process.exit(1);
}

main();
