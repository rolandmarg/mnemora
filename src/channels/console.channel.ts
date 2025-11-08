/**
 * Console Output Channel
 * 
 * Simple output channel that logs messages to the console
 */

import { BaseOutputChannel } from '../base/base-output-channel.js';
import type { SendOptions, SendResult, OutputChannelMetadata } from '../interfaces/output-channel.interface.js';

/**
 * Console output channel implementation
 * 
 * Logs messages to stdout/stderr
 */
export class ConsoleOutputChannel extends BaseOutputChannel {
  async send(message: string, _options?: SendOptions): Promise<SendResult> {
    try {
      console.log(message);
      return {
        success: true,
        messageId: `console-${Date.now()}`,
        metadata: { timestamp: new Date().toISOString() },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  isAvailable(): boolean {
    // Console is always available
    return true;
  }

  getMetadata(): OutputChannelMetadata {
    return {
      name: 'Console',
      type: 'console',
      description: 'Logs messages to the console (stdout)',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: true,
      capabilities: ['logging', 'always-available'],
    };
  }
}

