import type { OutputChannel, SendOptions, SendResult, OutputChannelMetadata } from './output-channel.interface.js';

export abstract class BaseOutputChannel implements OutputChannel {
  abstract send(message: string, options?: SendOptions): Promise<SendResult>;

  async sendToMultiple(recipients: string[], message: string, options?: SendOptions): Promise<SendResult[]> {
    return Promise.all(
      recipients.map(recipient => 
        this.send(message, { ...options, recipients: [recipient] })
      )
    );
  }

  abstract isAvailable(): boolean;

  abstract getMetadata(): OutputChannelMetadata;
}

