import { Client, LocalAuth, Chat } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';

class WhatsAppService {
  private client: Client | null = null;
  private ready: boolean = false;

  async initialize(): Promise<void> {
    if (this.ready) return;

    this.client = new Client({
      authStrategy: new LocalAuth(),
    });

    this.client.on('qr', (qr: string) => {
      console.log('Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log('WhatsApp client is ready!');
      this.ready = true;
    });

    this.client.on('authenticated', () => {
      console.log('WhatsApp client authenticated!');
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('WhatsApp authentication failed:', msg);
    });

    await this.client.initialize();
  }

  /**
   * Wait for client to be ready
   * @param timeout - Timeout in milliseconds
   * @returns Promise that resolves when ready
   */
  async waitForReady(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    while (!this.ready && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!this.ready) {
      throw new Error('WhatsApp client not ready within timeout');
    }
  }

  /**
   * Send message to WhatsApp group
   * @param message - Message to send
   * @returns Promise that resolves when message is sent
   */
  async sendMessage(message: string): Promise<void> {
    await this.initialize();
    await this.waitForReady();

    if (!config.whatsapp.groupId) {
      throw new Error('WhatsApp group ID not configured. Please set WHATSAPP_GROUP_ID in .env');
    }

    if (!this.client) {
      throw new Error('WhatsApp client not initialized');
    }

    try {
      const chatId = `${config.whatsapp.groupId}@g.us`;
      await this.client.sendMessage(chatId, message);
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Get group ID from group name (helper function)
   * @param groupName - Name of the group
   * @returns Group ID or null if not found
   */
  async getGroupId(groupName: string): Promise<string | null> {
    await this.initialize();
    await this.waitForReady();

    if (!this.client) {
      throw new Error('WhatsApp client not initialized');
    }

    try {
      const chats: Chat[] = await this.client.getChats();
      const group = chats.find(chat => chat.isGroup && chat.name === groupName);
      return group ? group.id._serialized : null;
    } catch (error) {
      console.error('Error getting group ID:', error);
      return null;
    }
  }

  // Expose client for scripts that need direct access
  get clientInstance(): Client | null {
    return this.client;
  }
}

export default new WhatsAppService();

