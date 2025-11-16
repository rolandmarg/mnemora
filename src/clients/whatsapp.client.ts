import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { isLambda } from '../utils/runtime.util.js';
import chromium from '@sparticuz/chromium';

class WhatsAppClient {
  private client: InstanceType<typeof Client> | null = null;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  private readonly sessionPath: string;
  private readonly isLambda: boolean;
  private authRequired: boolean = false;

  constructor() {
    this.isLambda = isLambda();
    // Use /tmp in Lambda (writable), process.cwd() locally
    this.sessionPath = this.isLambda 
      ? join('/tmp', '.wwebjs_auth')
      : join(process.cwd(), '.wwebjs_auth');
    
    // Create directory structure if it doesn't exist
    // LocalAuth creates a 'session' subdirectory, so we need to pre-create it
    if (!existsSync(this.sessionPath)) {
      mkdirSync(this.sessionPath, { recursive: true });
    }
    
    // Pre-create the session subdirectory that LocalAuth expects
    const sessionSubdir = join(this.sessionPath, 'session');
    if (!existsSync(sessionSubdir)) {
      mkdirSync(sessionSubdir, { recursive: true });
    }
  }

  /**
   * Get the session path. Useful for external session management (e.g., S3 sync)
   */
  getSessionPath(): string {
    return this.sessionPath;
  }

  async initialize(): Promise<void> {
    if (this.isReady && this.client) {
      try {
        const state = await this.client.getState();
        if (state === 'CONNECTED' || state === 'OPENING') {
          return;
        }
      } catch (_error) {
        this.client = null;
        this.isReady = false;
      }
    }

    if (this.isInitializing) {
      return new Promise((resolve, reject) => {
        const checkReady = setInterval(() => {
          if (this.isReady && this.client) {
            clearInterval(checkReady);
            resolve();
          } else if (!this.isInitializing) {
            clearInterval(checkReady);
            reject(new Error('Initialization failed'));
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkReady);
          reject(new Error('Initialization timeout'));
        }, 180000);
      });
    }

    this.isInitializing = true;

    return new Promise(async (resolve, reject) => {
      try {
        if (this.client) {
          this.client.destroy().catch(() => {});
          this.client = null;
        }

        // Configure Puppeteer for Lambda (use Chromium) or local (use default)
        const puppeteerConfig: {
          headless: boolean;
          args: string[];
          timeout: number;
          executablePath?: string;
        } = {
          headless: true, // NO browser window - QR code in terminal only
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
          timeout: 90000, // 90 second timeout for browser launch
        };

        // Use Chromium in Lambda environment
        if (this.isLambda) {
          // Set Chromium path and args for Lambda
          puppeteerConfig.executablePath = await chromium.executablePath();
          puppeteerConfig.args = [
            ...chromium.args,
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ];
        }

        this.client = new Client({
          authStrategy: new LocalAuth({
            dataPath: this.sessionPath,
          }),
          puppeteer: puppeteerConfig,
        });
        
        this.setupClientEvents(resolve, reject);
      } catch (error) {
        this.isInitializing = false;
        this.client = null;
        
        // Improve error message for Chromium download issues
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();
          if (errorMessage.includes('browser') && (errorMessage.includes('not found') || errorMessage.includes('chromium'))) {
            // Replace npm install suggestions with yarn install
            const improvedError = new Error(
              error.message.replace(/npm install/g, 'yarn install') +
              '\n\n💡 Tip: Run `yarn install` to download the required Chromium browser.'
            );
            reject(improvedError);
            return;
          }
        }
        
        reject(error);
      }
    });
  }

  private setupClientEvents(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.client) {
      reject(new Error('Failed to create WhatsApp client'));
      return;
    }

    // Set a timeout for initialization (3 minutes)
    let initTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!this.isReady) {
        this.isInitializing = false;
        if (this.client) {
          this.client.destroy().catch(() => {});
          this.client = null;
        }
        reject(new Error('WhatsApp client initialization timeout - please try again'));
      }
    }, 180000);

    const clearInitTimeout = () => {
      if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
      }
    };

    this.client.on('qr', (qr: string) => {
      clearInitTimeout();
      this.authRequired = true;
      
      if (this.isLambda) {
        console.log(JSON.stringify({
          level: 'warn',
          message: '🔐 WHATSAPP AUTHENTICATION REQUIRED - QR CODE IN LOGS',
          qrCode: qr,
          instructions: [
            '1. Open CloudWatch Logs and find this log entry',
            '2. Copy the qrCode value from the log',
            '3. Open WhatsApp on your phone',
            '4. Go to Settings > Linked Devices',
            '5. Tap "Link a Device"',
            '6. Use a QR code generator to display the code and scan it',
            `7. Or use: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
          ],
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
          note: 'Lambda will timeout, but session will be saved to S3. Next invocation will use saved session.',
        }));
        
        console.log(JSON.stringify({
          level: 'info',
          message: 'QR_CODE_FOR_SCANNING',
          qrCode: qr,
          format: 'base64',
        }));
      } else {
        console.log(`\n${'='.repeat(60)}`);
        console.log('🔐 WHATSAPP AUTHENTICATION REQUIRED');
        console.log('='.repeat(60));
        console.log('\n📱 Please scan the QR code below with your WhatsApp mobile app:');
        console.log('   1. Open WhatsApp on your phone');
        console.log('   2. Go to Settings > Linked Devices');
        console.log('   3. Tap "Link a Device"');
        console.log('   4. Scan the QR code below\n');
        console.log('-'.repeat(60));
        qrcode.generate(qr, { small: true });
        console.log('-'.repeat(60));
        console.log('\n⏳ Waiting for you to scan the QR code...');
        console.log('💡 Keep this terminal open while scanning\n');
      }
    });

    this.client.on('loading_screen', (percent: string, message: string) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
    });

    this.client.on('authenticated', () => {
      if (this.authRequired) {
        console.log('\n✅ QR code scanned successfully!');
        console.log('🔐 Authenticating with WhatsApp...\n');
      }
      this.authRequired = false;
    });

    this.client.on('ready', () => {
      clearInitTimeout();
      this.isReady = true;
      this.isInitializing = false;
      this.authRequired = false;
      console.log('✅ WhatsApp client is ready!');
      resolve();
    });

    this.client.on('auth_failure', (msg: string) => {
      clearInitTimeout();
      this.isInitializing = false;
      this.client = null;
      this.isReady = false;
      reject(new Error(`WhatsApp authentication failed: ${msg}`));
    });

    this.client.on('disconnected', (_reason: string) => {
      this.isReady = false;
      this.client = null;
    });

    this.client.on('error', (_error: unknown) => {});

    this.client.initialize().catch((error) => {
      clearInitTimeout();
      this.isInitializing = false;
      this.client = null;
      
      // Improve error message for Chromium download issues
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('browser') && (errorMessage.includes('not found') || errorMessage.includes('chromium'))) {
          // Replace npm install suggestions with yarn install
          const improvedError = new Error(
            error.message.replace(/npm install/g, 'yarn install') +
            '\n\n💡 Tip: Run `yarn install` to download the required Chromium browser.'
          );
          reject(improvedError);
          return;
        }
      }
      
      reject(error);
    });
  }

  getClient(): InstanceType<typeof Client> {
    if (!this.client || !this.isReady) {
      throw new Error('WhatsApp client is not initialized. Call initialize() first.');
    }
    return this.client;
  }

  isClientReady(): boolean {
    return this.isReady && this.client !== null;
  }

  requiresAuth(): boolean {
    return this.authRequired || !this.isReady;
  }

  async findGroupByName(groupName: string): Promise<{ id: string; name: string } | null> {
    const client = this.getClient();
    const chats = await client.getChats();
    const group = chats.find(chat => chat.isGroup && chat.name === groupName);
    
    if (group) {
      return {
        id: group.id._serialized,
        name: group.name ?? groupName,
      };
    }
    
    return null;
  }

  async sendMessage(chatId: string, message: string): Promise<{ id: string; from: string }> {
    const client = this.getClient();
    const result = await client.sendMessage(chatId, message);
    return {
      id: result.id._serialized,
      from: result.from ?? chatId,
    };
  }

  async destroy(): Promise<void> {
    if (this.client) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.client.destroy();
      } catch {
        // Ignore errors during cleanup
      } finally {
        this.client = null;
        this.isReady = false;
        this.isInitializing = false;
      }
    }
  }

  getAuthStatus(): { isReady: boolean; requiresAuth: boolean; isInitializing: boolean } {
    return {
      isReady: this.isReady,
      requiresAuth: this.requiresAuth(),
      isInitializing: this.isInitializing,
    };
  }
}

const whatsappClient = new WhatsAppClient();
export default whatsappClient;

