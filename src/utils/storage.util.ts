import { FileStorage } from '../clients/s3.client.js';

export function createWhatsAppSessionStorage(): FileStorage {
  return new FileStorage('.wwebjs_auth');
}

