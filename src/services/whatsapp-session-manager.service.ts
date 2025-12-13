/**
 * WhatsApp Session Manager Service
 * 
 * Handles S3 sync for WhatsApp session persistence.
 * Unified behavior for both Lambda and local environments:
 * - Always syncs from S3 before initialization (if S3 is configured)
 * - Always syncs to S3 after execution (if S3 is configured)
 */

import { StorageService } from './storage.service.js';
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
   * Unified behavior: always tries to sync from S3 if configured.
   * If session doesn't exist in S3, the WhatsApp client will handle authentication.
   */
  async syncSessionFromS3(sessionPath: string): Promise<void> {
    try {
      await this.storage.syncFromS3(sessionPath);
      this.logger.info('WhatsApp session synced from S3');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if error is due to session not existing in S3
      const isNotFoundError = errorMessage.includes('not found') || 
          errorMessage.includes('not exist') ||
          errorMessage.includes('archive not found');
      
      if (isNotFoundError) {
        // Session not in S3 - this is fine, WhatsApp client will handle authentication
        // In Lambda, this will cause QR auth error (expected)
        // In local, this will trigger QR code display (expected)
        this.logger.debug('Session not found in S3, WhatsApp client will handle authentication', {
          sessionPath,
        });
        return;
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
   * Unified behavior: always tries to sync to S3 if configured (both Lambda and local).
   */
  async syncSessionToS3(sessionPath: string): Promise<void> {
    try {
      await this.storage.syncToS3(sessionPath);
      this.logger.info('WhatsApp session synced to S3');
    } catch (error) {
      // Log but don't fail - session is still usable locally
      // S3 might not be configured, which is fine
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not initialized') || errorMessage.includes('not configured')) {
        // S3 not configured - this is fine
        this.logger.debug('S3 not configured, skipping session sync');
      } else {
        this.logger.warn('Failed to sync session to S3', {
          error: errorMessage,
        });
      }
    }
  }
}

