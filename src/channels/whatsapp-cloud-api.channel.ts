/**
 * WhatsApp Cloud API Output Channel (Stub)
 * 
 * Placeholder for future WhatsApp Cloud API implementation
 * This will replace whatsapp-web.js for cloud deployment
 * 
 * Migration path:
 * 1. Implement this channel using WhatsApp Cloud API
 * 2. Update OutputChannelFactory to support feature flag
 * 3. Switch configuration to use Cloud API
 * 4. Remove whatsapp-web.js dependency
 */

import { BaseOutputChannel } from '../base/base-output-channel.js';
import type { SendOptions, SendResult, OutputChannelMetadata } from '../interfaces/output-channel.interface.js';
import type { AppConfig } from '../config.js';

/**
 * WhatsApp Cloud API output channel implementation (stub)
 * 
 * TODO: Implement using WhatsApp Cloud API
 * - No QR codes needed (uses API tokens)
 * - No session management (REST API)
 * - Better for serverless/cloud
 * - Official API (ToS compliant)
 * 
 * See: CLOUD_DEPLOYMENT_RECOMMENDATION.md for details
 */
export class WhatsAppCloudAPIOutputChannel extends BaseOutputChannel {
  constructor(_config: AppConfig) {
    super();
  }

  async send(_message: string, _options?: SendOptions): Promise<SendResult> {
    return {
      success: false,
      error: new Error('WhatsApp Cloud API implementation not yet available. Use whatsapp-web.js channel for now.'),
    };
  }

  isAvailable(): boolean {
    return false; // Not implemented yet
  }

  getMetadata(): OutputChannelMetadata {
    return {
      name: 'WhatsApp (Cloud API)',
      type: 'whatsapp-cloud-api',
      description: 'Sends WhatsApp messages via official WhatsApp Cloud API (not yet implemented)',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: false, // Cloud API has limited group support
      capabilities: ['whatsapp', 'cloud-api', 'no-qr-code'],
    };
  }
}

