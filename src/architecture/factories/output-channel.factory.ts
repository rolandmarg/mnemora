/**
 * Output Channel Factory
 * 
 * Creates output channel instances based on configuration
 */

import type { IOutputChannel } from '../interfaces/output-channel.interface.js';
import type { OutputChannelType, OutputChannelConfig } from '../types/index.js';
import { config } from '../../config.js';

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
   * Create an output channel instance based on type
   * 
   * @param type - The type of output channel to create
   * @param channelConfig - Optional configuration specific to this channel
   * @returns Output channel instance implementing IOutputChannel
   * @throws Error if type is not supported
   */
  static create(type: OutputChannelType, channelConfig?: Partial<OutputChannelConfig>): IOutputChannel {
    switch (type) {
      case 'console':
        // Lazy import to avoid circular dependencies
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ConsoleOutputChannel } = require('../channels/console.channel.js');
        return new ConsoleOutputChannel();

      case 'sms':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { SMSOutputChannel } = require('../channels/sms.channel.js');
        return new SMSOutputChannel(config);

      case 'whatsapp':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { WhatsAppOutputChannel } = require('../channels/whatsapp.channel.js');
        return new WhatsAppOutputChannel(config);

      case 'email':
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { EmailOutputChannel } = require('../channels/email.channel.js');
        return new EmailOutputChannel(channelConfig);

      default:
        throw new Error(`Unsupported output channel type: ${type}`);
    }
  }

  /**
   * Create multiple output channels from configuration
   * 
   * @param configs - Array of output channel configurations
   * @returns Array of output channel instances (only enabled ones)
   */
  static createMultiple(configs: OutputChannelConfig[]): IOutputChannel[] {
    return configs
      .filter(config => config.enabled !== false)
      .map(config => this.create(config.type, config));
  }
}

