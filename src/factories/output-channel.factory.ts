/**
 * Output Channel Factory
 * 
 * Creates output channel instances based on configuration
 */

import { ConsoleOutputChannel } from '../channels/console.channel.js';
import { SMSOutputChannel } from '../channels/sms.channel.js';
import { WhatsAppOutputChannel } from '../channels/whatsapp.channel.js';
import { EmailOutputChannel } from '../channels/email.channel.js';
import { BaseOutputChannel } from '../base/base-output-channel.js';
import { config } from '../config.js';

/**
 * Supported output channel types
 */
export type OutputChannelType = 'console' | 'sms' | 'whatsapp' | 'email';

/**
 * Configuration for output channel factory
 */
export interface OutputChannelConfig {
  type: OutputChannelType;
  enabled?: boolean;
  [key: string]: unknown;
}

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
  /**
   * Create a console output channel
   */
  static create(type: 'console'): ConsoleOutputChannel;
  /**
   * Create an SMS output channel
   */
  static create(type: 'sms'): SMSOutputChannel;
  /**
   * Create a WhatsApp output channel
   */
  static create(type: 'whatsapp'): WhatsAppOutputChannel;
  /**
   * Create an email output channel
   */
  static create(type: 'email', channelConfig?: Partial<OutputChannelConfig>): EmailOutputChannel;
  /**
   * Create an output channel instance based on type
   * 
   * @param type - The type of output channel to create
   * @param channelConfig - Optional configuration specific to this channel
   * @returns Output channel instance extending BaseOutputChannel
   * @throws Error if type is not supported
   */
  static create(type: OutputChannelType, channelConfig?: Partial<OutputChannelConfig>): BaseOutputChannel {
    switch (type) {
      case 'console':
        return new ConsoleOutputChannel();

      case 'sms':
        return new SMSOutputChannel(config);

      case 'whatsapp':
        return new WhatsAppOutputChannel(config);

      case 'email':
        return new EmailOutputChannel(channelConfig);

      default:
        throw new Error(`Unsupported output channel type: ${type}`);
    }
  }

}

