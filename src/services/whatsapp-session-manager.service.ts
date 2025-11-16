/**
 * WhatsApp Session Manager Service
 * 
 * Handles S3 sync for WhatsApp session persistence in Lambda.
 * This service is responsible for syncing session data to/from S3
 * while keeping the WhatsApp client infrastructure-agnostic.
 */

import { FileStorage } from '../clients/s3.client.js';
import { isLambda } from '../utils/runtime.util.js';
import type { AppContext } from '../app-context.js';

export class WhatsAppSessionManagerService {
  private readonly storage: FileStorage;
  private readonly isLambda: boolean;

  constructor(private readonly ctx: AppContext) {
    this.isLambda = isLambda();
    this.storage = new FileStorage('.wwebjs_auth');
  }

  /**
   * Sync session from S3 to local filesystem.
   * Should be called before initializing the WhatsApp client in Lambda.
   */
  async syncSessionFromS3(sessionPath: string): Promise<void> {
    if (!this.isLambda) {
      // Not needed in local development
      return;
    }

    try {
      await this.storage.syncFromS3(sessionPath);
      this.ctx.logger.info('WhatsApp session synced from S3');
    } catch (error) {
      // Log but don't fail - session might not exist yet (first run)
      this.ctx.logger.warn('Failed to sync session from S3 (this is normal on first run)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Sync session from local filesystem to S3.
   * Should be called after authentication or when session changes in Lambda.
   */
  async syncSessionToS3(sessionPath: string): Promise<void> {
    if (!this.isLambda) {
      // Not needed in local development
      return;
    }

    try {
      await this.storage.syncToS3(sessionPath);
      this.ctx.logger.info('WhatsApp session synced to S3');
    } catch (error) {
      // Log but don't fail - session is still usable locally
      this.ctx.logger.warn('Failed to sync session to S3', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

