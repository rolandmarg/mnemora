import { ConsoleOutputChannel } from './implementations/console.channel.js';
import { WhatsAppOutputChannel } from './implementations/whatsapp.channel.js';
import type { AppContext } from '../app-context.js';

export class OutputChannelFactory {
  static createConsoleOutputChannel(): ConsoleOutputChannel {
    return new ConsoleOutputChannel();
  }

  static createWhatsAppOutputChannel(ctx: AppContext): WhatsAppOutputChannel {
    return new WhatsAppOutputChannel(ctx);
  }
}

