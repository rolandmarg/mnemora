/**
 * SMS Output Channel
 * 
 * Adapter that wraps Twilio SMS functionality to implement IOutputChannel
 * 
 * Note: This is a placeholder. The actual implementation should wrap
 * the existing Twilio SMS service when it's created.
 */

import type { IOutputChannel, SendOptions, SendResult, OutputChannelMetadata } from '../interfaces/output-channel.interface.js';
import type { AppConfig } from '../../config.js';

/**
 * SMS output channel implementation using Twilio
 * 
 * Sends SMS messages via Twilio
 */
export class SMSOutputChannel implements IOutputChannel {
  constructor(_config?: AppConfig) {
    // TODO: Use config when SMS implementation is added
  }

  async send(message: string, options?: SendOptions): Promise<SendResult> {
    // TODO: Implement using Twilio SMS service
    // This should wrap the existing Twilio service when available
    const recipient = options?.recipients?.[0];
    
    if (!recipient) {
      return {
        success: false,
        error: new Error('No recipient specified for SMS'),
      };
    }

    // Placeholder implementation
    // Replace with actual Twilio SMS call
    console.log(`[SMS] Would send to ${recipient}: ${message}`);
    
    return {
      success: true,
      messageId: `sms-${Date.now()}`,
      recipient,
      metadata: { timestamp: new Date().toISOString() },
    };
  }

  async sendToMultiple(recipients: string[], message: string, options?: SendOptions): Promise<SendResult[]> {
    const results: SendResult[] = [];
    
    for (const recipient of recipients) {
      const result = await this.send(message, { ...options, recipients: [recipient] });
      results.push(result);
    }
    
    return results;
  }

  isAvailable(): boolean {
    // TODO: Check Twilio SMS configuration when implemented
    // This should check for TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_NUMBER
    return false; // Not implemented yet
  }

  getMetadata(): OutputChannelMetadata {
    return {
      name: 'SMS (Twilio)',
      type: 'sms',
      description: 'Sends SMS messages via Twilio',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: true,
      capabilities: ['sms', 'twilio'],
    };
  }
}

