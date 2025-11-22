import { ConsoleOutputChannel } from './implementations/console.channel.js';
import { WhatsAppOutputChannel } from './implementations/whatsapp.channel.js';
import type { Logger } from '../types/logger.types.js';
import type { AppConfig } from '../config.js';
import type { AlertingService } from '../services/alerting.service.js';
import whatsappClientDefault from '../clients/whatsapp.client.js';
import cloudWatchMetricsClientDefault from '../clients/cloudwatch.client.js';

export type WhatsAppClient = typeof whatsappClientDefault;
export type CloudWatchClient = typeof cloudWatchMetricsClientDefault;

export interface WhatsAppOutputChannelOptions {
  logger: Logger;
  config: AppConfig;
  whatsappClient: WhatsAppClient;
  cloudWatchClient: CloudWatchClient;
  alerting: AlertingService;
}

export class OutputChannelFactory {
  static createConsoleOutputChannel(): ConsoleOutputChannel {
    return new ConsoleOutputChannel();
  }

  static createWhatsAppOutputChannel(options: WhatsAppOutputChannelOptions): WhatsAppOutputChannel {
    return new WhatsAppOutputChannel(options);
  }
}

