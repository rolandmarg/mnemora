import { ConsoleOutputChannel } from '../channels/console.channel.js';
import { WhatsAppOutputChannel } from '../channels/whatsapp.channel.js';
import type { AppContext } from '../app-context.js';

export class OutputChannelFactory {
  static createConsoleOutputChannel(): ConsoleOutputChannel {
    return new ConsoleOutputChannel();
  }

  static createWhatsAppOutputChannel(ctx: AppContext): WhatsAppOutputChannel {
    return new WhatsAppOutputChannel(ctx);
  }
}

