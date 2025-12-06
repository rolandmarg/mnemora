/**
 * WhatsApp Session Manager Service
 * 
 * Handles S3 sync for WhatsApp session persistence in Lambda.
 * This service is responsible for syncing session data to/from S3
 * while keeping the WhatsApp client infrastructure-agnostic.
 */

import { StorageService } from './storage.service.js';
import { isLambda } from '../utils/runtime.util.js';
import type { Logger } from '../types/logger.types.js';

export class WhatsAppSessionManagerService {
  private readonly storage = StorageService.getSessionStorage();

  constructor(private readonly logger: Logger) {}

  /**
   * Check if WhatsApp session exists in S3.
   * Returns true if session archive exists, false otherwise.
   * Works in both Lambda and local environments if S3 is configured.
   */
  async sessionExistsInS3(): Promise<boolean> {
    try {
      const archiveKey = 'auth_info/session.tar.gz';
      return await this.storage.fileExists(archiveKey);
    } catch (_error) {
      return false;
    }
  }

  /**
   * Sync session from S3 to local filesystem.
   * Should be called before initializing the WhatsApp client.
   * In local development, this is optional - will use local session if S3 sync fails.
   * 
   * @throws Error if session doesn't exist in S3 (Lambda only - local dev will fall back to local session)
   */
  async syncSessionFromS3(sessionPath: string): Promise<void> {
    // In local dev, try to sync from S3 if available, but don't fail if it doesn't exist
    const isLocal = !isLambda();
    
    if (isLocal) {
      // In local dev, try to sync but don't fail if session doesn't exist
      try {
        await this.storage.syncFromS3(sessionPath);
        this.logger.info('WhatsApp session synced from S3');
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not found') || 
            errorMessage.includes('not exist') ||
            errorMessage.includes('archive not found')) {
          // Session doesn't exist in S3 - this is fine for local dev
          this.logger.debug('Session not found in S3, using local session', {
            sessionPath,
          });
          return;
        }
        // Other errors - log but don't fail in local dev
        this.logger.warn('Failed to sync session from S3 (using local session)', {
          error: errorMessage,
        });
        return;
      }
    }

    try {
      await this.storage.syncFromS3(sessionPath);
      this.logger.info('WhatsApp session synced from S3');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If session doesn't exist, provide helpful error message
      if (errorMessage.includes('not found') || 
          errorMessage.includes('not exist') ||
          errorMessage.includes('archive not found')) {
        const helpfulError = new Error(
          'WhatsApp session not found in S3. ' +
          'Please authenticate locally first, then sync the session to S3. ' +
          'The Lambda function cannot authenticate via QR code - it requires a pre-authenticated session.'
        );
        this.logger.error('WhatsApp session not found in S3', {
          error: helpfulError.message,
        });
        throw helpfulError;
      }
      
      // For other errors, log and rethrow
      this.logger.error('Failed to sync session from S3', {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Sync session from local filesystem to S3.
   * Should be called at the end of execution to save session state.
   * Works in both Lambda and local environments if S3 is configured.
   */
  async syncSessionToS3(sessionPath: string): Promise<void> {
    try {
      await this.storage.syncToS3(sessionPath);
      this.logger.info('WhatsApp session synced to S3');
    } catch (error) {
      // Log but don't fail - session is still usable locally
      // In local dev, S3 might not be configured, which is fine
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not initialized') || errorMessage.includes('not configured')) {
        // S3 not configured - this is fine for local dev
        this.logger.debug('S3 not configured, skipping session sync', {
          environment: isLambda() ? 'lambda' : 'local',
        });
      } else {
        this.logger.warn('Failed to sync session to S3', {
          error: errorMessage,
        });
      }
    }
  }
}

