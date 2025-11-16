import { BaseOutputChannel } from '../output-channel/output-channel.base.js';
import type { SendOptions, SendResult, OutputChannelMetadata } from '../output-channel/output-channel.interface.js';

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

