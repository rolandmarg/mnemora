import { ConsoleOutputChannel } from './implementations/console.channel.js';
import { WhatsAppOutputChannel } from './implementations/whatsapp.channel.js';
import type { Logger } from '../types/logger.types.js';
import type { AppConfig } from '../config.js';
import whatsappClientDefault from '../clients/whatsapp.client.js';
import cloudWatchMetricsClientDefault from '../clients/cloudwatch.client.js';

type WhatsAppClient = typeof whatsappClientDefault;
type CloudWatchClient = typeof cloudWatchMetricsClientDefault;

export class OutputChannelFactory {
  static createConsoleOutputChannel(): ConsoleOutputChannel {
    return new ConsoleOutputChannel();
  }

  static createWhatsAppOutputChannel(
    logger: Logger,
    config: AppConfig,
    whatsappClient: WhatsAppClient,
    cloudWatchClient: CloudWatchClient
  ): WhatsAppOutputChannel {
    return new WhatsAppOutputChannel(logger, config, whatsappClient, cloudWatchClient);
  }
}

