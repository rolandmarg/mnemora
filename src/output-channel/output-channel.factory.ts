import { ConsoleOutputChannel } from '../channels/console.channel.js';
import { WhatsAppOutputChannel } from '../channels/whatsapp.channel.js';
import { config } from '../config.js';

export class OutputChannelFactory {
  static createConsoleOutputChannel(): ConsoleOutputChannel {
    return new ConsoleOutputChannel();
  }

  static createWhatsAppOutputChannel(): WhatsAppOutputChannel {
    return new WhatsAppOutputChannel(config);
  }
}

