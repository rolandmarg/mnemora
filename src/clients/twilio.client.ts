import twilio from 'twilio';
import { config } from '../config.js';
import xrayClient from './xray.client.js';
import type { Logger } from '../types/logger.types.js';

export class TwilioClientWrapper {
  private client: twilio.Twilio | null = null;
  private readonly fromNumber: string | undefined;
  private readonly toNumber: string | undefined;
  private readonly logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
    const accountSid = config.twilio.accountSid;
    const authToken = config.twilio.authToken;
    this.fromNumber = config.twilio.fromNumber;
    this.toNumber = config.twilio.toNumber;

    // Initialize Twilio client only if credentials are provided
    // Wrap in try-catch to ensure initialization failures don't break the app
    if (accountSid && authToken) {
      try {
        this.client = twilio(accountSid, authToken);
      } catch (error) {
        // Log but don't throw - Twilio is optional
        if (this.logger) {
          this.logger.warn('Failed to initialize Twilio client', error);
        } else {
          console.warn('Failed to initialize Twilio client:', error);
        }
        this.client = null;
      }
    }
  }

  isAvailable(): boolean {
    return this.client !== null && this.fromNumber !== undefined && this.toNumber !== undefined;
  }

  async sendSMS(message: string): Promise<string> {
    if (!this.client || !this.fromNumber || !this.toNumber) {
      throw new Error('Twilio client not initialized. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and TWILIO_TO_NUMBER environment variables.');
    }

    // Wrap X-Ray segment in try-catch to ensure X-Ray errors don't break SMS sending
    try {
      return await xrayClient.captureAsyncSegment('Twilio.sendSMS', async () => {
        const response = await this.client!.messages.create({
          body: message,
          from: this.fromNumber!,
          to: this.toNumber!,
        });

        return response.sid;
      }, {
        fromNumber: this.fromNumber,
        toNumber: this.toNumber,
        messageLength: message.length,
      });
    } catch (_xrayError) {
      // If X-Ray fails, still try to send SMS without tracing
      // This ensures X-Ray issues don't prevent SMS delivery
      const response = await this.client!.messages.create({
        body: message,
        from: this.fromNumber!,
        to: this.toNumber!,
      });

      return response.sid;
    }
  }
}

let twilioClientInstance: TwilioClientWrapper | null = null;

export function createTwilioClient(logger?: Logger): TwilioClientWrapper {
  twilioClientInstance ??= new TwilioClientWrapper(logger);
  return twilioClientInstance;
}

export default createTwilioClient;
