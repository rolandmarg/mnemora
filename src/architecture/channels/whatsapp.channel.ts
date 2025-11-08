/**
 * WhatsApp Output Channel
 * 
 * Adapter that wraps Twilio WhatsApp functionality to implement IOutputChannel
 * 
 * Note: This is a placeholder. The actual implementation should wrap
 * the existing Twilio WhatsApp service when it's created.
 */

import type { IOutputChannel, SendOptions, SendResult, OutputChannelMetadata } from '../interfaces/output-channel.interface.js';
import type { AppConfig } from '../../config.js';

/**
 * WhatsApp output channel implementation using Twilio
 * 
 * Sends WhatsApp messages via Twilio
 */
export class WhatsAppOutputChannel implements IOutputChannel {
  constructor(_config?: AppConfig) {
    // TODO: Use config when WhatsApp implementation is added
  }

  async send(message: string, options?: SendOptions): Promise<SendResult> {
    // TODO: Implement using Twilio WhatsApp service
    // This should wrap the existing Twilio service when available
    const recipient = options?.recipients?.[0];
    
    if (!recipient) {
      return {
        success: false,
        error: new Error('No recipient specified for WhatsApp'),
      };
    }

    // Placeholder implementation
    // Replace with actual Twilio WhatsApp call
    console.log(`[WhatsApp] Would send to ${recipient}: ${message}`);
    
    return {
      success: true,
      messageId: `whatsapp-${Date.now()}`,
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
    // TODO: Check Twilio WhatsApp configuration when implemented
    // This should check for TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
    return false; // Not implemented yet
  }

  getMetadata(): OutputChannelMetadata {
    return {
      name: 'WhatsApp (Twilio)',
      type: 'whatsapp',
      description: 'Sends WhatsApp messages via Twilio',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: true,
      capabilities: ['whatsapp', 'twilio'],
    };
  }
}

