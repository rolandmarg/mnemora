/**
 * Authentication Reminder System
 * 
 * Tracks last WhatsApp authentication date and sends reminders
 * when refresh is needed (7 days)
 * Uses S3 for storage (cheaper than DynamoDB)
 */

import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { createWhatsAppSessionStorage } from './s3-storage.js';

/**
 * Check if running in Lambda environment
 */
function isLambdaEnvironment(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

/**
 * Authentication reminder service
 */
class AuthReminderService {
  private readonly storage: ReturnType<typeof createWhatsAppSessionStorage>;
  private readonly reminderDays: number = 7;
  private readonly authKey: string = 'whatsapp-auth.json';

  constructor() {
    this.storage = createWhatsAppSessionStorage();
  }

  /**
   * Record successful authentication
   */
  async recordAuthentication(): Promise<void> {
    const now = new Date();
    const timestamp = now.toISOString();

    try {
      const authData = JSON.stringify({ timestamp });
      
      if (isLambdaEnvironment()) {
        await this.storage.writeFile(this.authKey, authData);
        logger.info('WhatsApp authentication recorded in S3', { timestamp });
      } else {
        // Local: log only
        logger.info('WhatsApp authentication recorded (local)', { timestamp });
      }
    } catch (error) {
      logger.error('Error recording authentication', error);
      // Don't throw - non-critical
    }
  }

  /**
   * Get last authentication date
   */
  async getLastAuthDate(): Promise<Date | null> {
    try {
      if (isLambdaEnvironment()) {
        const data = await this.storage.readFile(this.authKey);
        if (data) {
          const authData = JSON.parse(data.toString('utf-8'));
          if (authData.timestamp) {
            const date = new Date(authData.timestamp);
            if (!isNaN(date.getTime())) {
              return date;
            }
          }
        }
      }
      return null;
    } catch (error) {
      logger.error('Error getting last auth date', error);
      return null;
    }
  }

  /**
   * Check if authentication refresh is needed
   */
  async isRefreshNeeded(): Promise<boolean> {
    const lastAuth = await this.getLastAuthDate();
    if (!lastAuth) {
      // Never authenticated, refresh needed
      return true;
    }

    const now = new Date();
    const daysSinceAuth = Math.floor((now.getTime() - lastAuth.getTime()) / (1000 * 60 * 60 * 24));

    return daysSinceAuth >= this.reminderDays;
  }

  /**
   * Check and emit reminder if needed
   */
  async checkAndEmitReminder(): Promise<void> {
    const needsRefresh = await this.isRefreshNeeded();
    
    if (needsRefresh) {
      const lastAuth = await this.getLastAuthDate();
      const daysSinceAuth = lastAuth
        ? Math.floor((Date.now() - lastAuth.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      logger.warn('WhatsApp authentication refresh needed', {
        daysSinceAuth,
        reminderDays: this.reminderDays,
      });

      // Emit CloudWatch metric for alerting
      metrics.addMetric(
        'whatsapp.auth.refresh_needed',
        1,
        'Count',
        {
          DaysSinceAuth: daysSinceAuth?.toString() ?? 'never',
        }
      );

      // Log reminder message
      if (isLambdaEnvironment()) {
        logger.warn(
          `⚠️  WhatsApp authentication refresh needed! Last auth: ${lastAuth ? daysSinceAuth : 'never'} days ago. ` +
          `Please check CloudWatch Logs for QR code and scan it.`
        );
      } else {
        logger.warn(
          `⚠️  WhatsApp authentication refresh needed! Last auth: ${lastAuth ? daysSinceAuth : 'never'} days ago. ` +
          `Please run the authentication flow.`
        );
      }
    }
  }

  /**
   * Get authentication status
   */
  async getAuthStatus(): Promise<{
    lastAuthDate: Date | null;
    daysSinceAuth: number | null;
    needsRefresh: boolean;
  }> {
    const lastAuth = await this.getLastAuthDate();
    const daysSinceAuth = lastAuth
      ? Math.floor((Date.now() - lastAuth.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      lastAuthDate: lastAuth,
      daysSinceAuth,
      needsRefresh: await this.isRefreshNeeded(),
    };
  }
}

/**
 * Global auth reminder service instance
 */
export const authReminder = new AuthReminderService();

