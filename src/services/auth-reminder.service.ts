import { logger } from '../clients/logger.client.js';
import { metrics } from './metrics.service.js';
import { createWhatsAppSessionStorage } from '../utils/storage.util.js';
import { isLambdaEnvironment } from '../utils/env.util.js';

class AuthReminderService {
  private readonly storage: ReturnType<typeof createWhatsAppSessionStorage>;
  private readonly reminderDays: number = 7;
  private readonly authKey: string = 'whatsapp-auth.json';

  constructor() {
    this.storage = createWhatsAppSessionStorage();
  }

  async recordAuthentication(): Promise<void> {
    const now = new Date();
    const timestamp = now.toISOString();

    try {
      const authData = JSON.stringify({ timestamp });
      
      if (isLambdaEnvironment()) {
        await this.storage.writeFile(this.authKey, authData);
        logger.info('WhatsApp authentication recorded in S3', { timestamp });
      } else {
        logger.info('WhatsApp authentication recorded (local)', { timestamp });
      }
    } catch (error) {
      logger.error('Error recording authentication', error);
    }
  }

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

  async isRefreshNeeded(): Promise<boolean> {
    const lastAuth = await this.getLastAuthDate();
    if (!lastAuth) {
      return true;
    }

    const now = new Date();
    const daysSinceAuth = Math.floor((now.getTime() - lastAuth.getTime()) / (1000 * 60 * 60 * 24));

    return daysSinceAuth >= this.reminderDays;
  }

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

      metrics.addMetric(
        'whatsapp.auth.refresh_needed',
        1,
        'Count',
        {
          DaysSinceAuth: daysSinceAuth?.toString() ?? 'never',
        }
      );

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

export const authReminder = new AuthReminderService();

