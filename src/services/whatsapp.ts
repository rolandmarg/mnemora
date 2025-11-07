import WAWebJS from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';

// Extract types and classes from namespace
const Client = WAWebJS.Client;
const LocalAuth = WAWebJS.LocalAuth;
type Chat = WAWebJS.Chat;
type ClientType = InstanceType<typeof Client>;

class WhatsAppService {
  private client: ClientType | null = null;
  private ready: boolean = false;

  async initialize(): Promise<void> {
    if (this.ready) return;

    this.client = new Client({
      authStrategy: new LocalAuth(),
    });

    this.client.on('qr', (qr: string) => {
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📱 SCAN THIS QR CODE WITH WHATSAPP:');
      console.log('   1. Open WhatsApp on your phone');
      console.log('   2. Go to Settings → Linked Devices');
      console.log('   3. Tap "Link a Device"');
      console.log('   4. Scan the QR code below');
      console.log('═══════════════════════════════════════════════════════\n');
      qrcode.generate(qr, { small: true });
      console.log('\n═══════════════════════════════════════════════════════\n');
    });

    this.client.on('ready', () => {
      console.log('WhatsApp client is ready!');
      this.ready = true;
    });

    this.client.on('authenticated', () => {
      console.log('WhatsApp client authenticated!');
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('❌ WhatsApp authentication failed:', msg);
      this.ready = false;
    });

    this.client.on('disconnected', (reason: string) => {
      console.log('⚠️  WhatsApp client disconnected:', reason);
      this.ready = false;
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
    let lastLogTime = 0;
    while (!this.ready && (Date.now() - startTime) < timeout) {
      const elapsed = Date.now() - startTime;
      // Log progress every 5 seconds
      if (elapsed - lastLogTime >= 5000) {
        const remaining = Math.ceil((timeout - elapsed) / 1000);
        console.log(`Still waiting... (${remaining}s remaining)`);
        lastLogTime = elapsed;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!this.ready) {
      throw new Error(`WhatsApp client not ready within ${timeout / 1000} seconds. Please scan the QR code and try again.`);
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
  get clientInstance(): ClientType | null {
    return this.client;
  }
}

export default new WhatsAppService();

