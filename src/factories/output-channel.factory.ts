/**
 * Output Channel Factory
 * 
 * Creates output channel instances based on configuration
 */

import { ConsoleOutputChannel } from '../channels/console.channel.js';
import { SMSOutputChannel } from '../channels/sms.channel.js';
import { WhatsAppOutputChannel } from '../channels/whatsapp.channel.js';
import { EmailOutputChannel } from '../channels/email.channel.js';
import { config } from '../config.js';

/**
 * Factory for creating output channel instances
 * 
 * Usage:
 * ```typescript
 * const channel = OutputChannelFactory.create('sms', config);
 * await channel.send('Hello!', { recipients: ['+1234567890'] });
 * ```
 */
export class OutputChannelFactory {

  static createConsoleOutputChannel(): ConsoleOutputChannel {
    return new ConsoleOutputChannel();
  }

  static createSMSOutputChannel(): SMSOutputChannel {
    return new SMSOutputChannel(config);
  }

  static createWhatsAppOutputChannel(): WhatsAppOutputChannel {
    return new WhatsAppOutputChannel(config);
  }

  static createEmailOutputChannel(): EmailOutputChannel {
    return new EmailOutputChannel();
  }
}

