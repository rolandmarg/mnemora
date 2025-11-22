import { StorageService } from './storage.service.js';
import type { AppContext } from '../app-context.js';

class AuthReminderService {
  private readonly storage = StorageService.getAppStorage();
  private readonly reminderDays: number = 7;
  private readonly authKey: string = 'whatsapp-auth.json';
  private pendingAuthTimestamp: string | null = null;

  constructor(private readonly ctx: AppContext) {}

  recordAuthentication(): void {
    const now = new Date();
    const timestamp = now.toISOString();
    
    // Store timestamp in memory for later batch write
    this.pendingAuthTimestamp = timestamp;
    
    if (this.ctx.isLambda) {
      this.ctx.logger.info('WhatsApp authentication recorded (pending S3 write)', { timestamp });
    } else {
      // In local mode, write immediately (not Lambda)
      this.flushPendingWrites().catch(() => {});
    }
  }

  async flushPendingWrites(): Promise<void> {
    if (!this.pendingAuthTimestamp) {
      return;
    }

    try {
      const authData = JSON.stringify({ timestamp: this.pendingAuthTimestamp });
      
      if (this.ctx.isLambda) {
        await this.storage.writeFile(this.authKey, authData);
        this.ctx.logger.info('WhatsApp authentication recorded in S3', { timestamp: this.pendingAuthTimestamp });
      } else {
        // Local mode already handled in recordAuthentication
        this.ctx.logger.info('WhatsApp authentication recorded (local)', { timestamp: this.pendingAuthTimestamp });
      }
      
      this.pendingAuthTimestamp = null;
    } catch (error) {
      this.ctx.logger.error('Error flushing authentication record', error);
    }
  }

  async getLastAuthDate(): Promise<Date | null> {
    try {
      if (this.ctx.isLambda) {
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
      this.ctx.logger.error('Error getting last auth date', error);
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

      this.ctx.logger.warn('WhatsApp authentication refresh needed', {
        daysSinceAuth,
        reminderDays: this.reminderDays,
      });

      this.ctx.clients.cloudWatch.putMetricData(
        this.ctx.config.metrics.namespace,
        [{
          MetricName: 'whatsapp.auth.refresh_needed',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [{ Name: 'DaysSinceAuth', Value: daysSinceAuth?.toString() ?? 'never' }],
        }]
      ).catch(() => {});

      if (this.ctx.isLambda) {
        this.ctx.logger.warn(
          `⚠️  WhatsApp authentication refresh needed! Last auth: ${lastAuth ? daysSinceAuth : 'never'} days ago. ` +
          `Please check CloudWatch Logs for QR code and scan it.`
        );
      } else {
        this.ctx.logger.warn(
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

export { AuthReminderService };

