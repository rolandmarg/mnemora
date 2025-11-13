/**
 * WhatsApp Output Channel
 * 
 * Implementation using whatsapp-web.js to send messages to WhatsApp groups
 * 
 * Login flow:
 * 1. Displays QR code in terminal
 * 2. Prompts user to scan with WhatsApp mobile app
 * 3. Waits for authentication
 * 4. Saves session for future use
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { BaseOutputChannel } from '../base/base-output-channel.js';
import { logger } from '../utils/logger.js';
import type { SendOptions, SendResult, OutputChannelMetadata } from '../interfaces/output-channel.interface.js';
import type { AppConfig } from '../config.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * WhatsApp output channel implementation using whatsapp-web.js
 * 
 * Sends WhatsApp messages via WhatsApp Web API
 * Runs completely headless - QR code shown in terminal only
 */
export class WhatsAppOutputChannel extends BaseOutputChannel {
  private client: InstanceType<typeof Client> | null = null;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  private readonly config: AppConfig;
  private readonly sessionPath: string;

  constructor(config: AppConfig) {
    super();
    this.config = config;
    // Store session data in .wwebjs_auth directory
    this.sessionPath = join(process.cwd(), '.wwebjs_auth');
    
    // Ensure session directory exists
    if (!existsSync(this.sessionPath)) {
      mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  /**
   * Initialize WhatsApp client if not already initialized
   * Handles QR code display and authentication flow
   */
  private async initializeClient(): Promise<void> {
    if (this.isReady && this.client) {
      // Verify client is still valid
      try {
        const state = await this.client.getState();
        if (state === 'CONNECTED' || state === 'OPENING') {
          return;
        }
      } catch (error) {
        // Client is invalid, reset and reinitialize
        logger.warn('Client state check failed, reinitializing', { error });
        this.client = null;
        this.isReady = false;
      }
    }

    if (this.isInitializing) {
      // Wait for initialization to complete
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
        
        // Timeout after 3 minutes
        setTimeout(() => {
          clearInterval(checkReady);
          reject(new Error('Initialization timeout'));
        }, 180000);
      });
    }

    this.isInitializing = true;

    return new Promise((resolve, reject) => {
      try {
        // Clean up any existing client first
        if (this.client) {
          this.client.destroy().catch(() => {
            // Ignore errors during cleanup
          });
          this.client = null;
        }

        // Create WhatsApp client - always headless, no browser window
        this.client = new Client({
          authStrategy: new LocalAuth({
            dataPath: this.sessionPath,
          }),
          puppeteer: {
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
          },
        });
        
        this.setupClientEvents(resolve, reject);
      } catch (error) {
        this.isInitializing = false;
        this.client = null;
        reject(error);
      }
    });
  }

  /**
   * Setup client event handlers for authentication flow
   */
  private setupClientEvents(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.client) {
      reject(new Error('Failed to create WhatsApp client'));
      return;
    }

    // Set a timeout for initialization (3 minutes)
    let initTimeout: NodeJS.Timeout | null = setTimeout(() => {
      if (!this.isReady) {
        logger.error('WhatsApp client initialization timeout');
        this.isInitializing = false;
        if (this.client) {
          this.client.destroy().catch(() => {
            // Ignore cleanup errors
          });
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

    // QR Code event - display in terminal
    this.client.on('qr', (qr: string) => {
      clearInitTimeout(); // Reset timeout when QR is shown
      console.log('\n' + '='.repeat(60));
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
      
      logger.info('QR code displayed - waiting for user to scan');
    });

    // Loading screen event
    this.client.on('loading_screen', (percent: string, message: string) => {
      console.log(`⏳ Loading: ${percent}% - ${message}`);
    });

    // Authenticated event - user scanned QR code
    this.client.on('authenticated', () => {
      console.log('\n✅ QR code scanned successfully!');
      console.log('🔐 Authenticating with WhatsApp...\n');
      logger.info('WhatsApp client authenticated - session will be saved');
    });

    // Ready event - client is ready to use
    this.client.on('ready', () => {
      clearInitTimeout();
      console.log('✅ WhatsApp client is ready!');
      console.log('💾 Session saved - you won\'t need to scan QR code again\n');
      logger.info('WhatsApp client is ready');
      this.isReady = true;
      this.isInitializing = false;
      // Give a moment for session to be fully saved
      setTimeout(() => resolve(), 1000);
    });

    // Authentication failure
    this.client.on('auth_failure', (msg: string) => {
      clearInitTimeout();
      console.log('\n❌ Authentication failed!');
      console.log(`   Error: ${msg}\n`);
      logger.error('WhatsApp authentication failed', { error: msg });
      this.isReady = false;
      this.isInitializing = false;
      reject(new Error(`WhatsApp authentication failed: ${msg}`));
    });

    // Disconnected event
    this.client.on('disconnected', (reason: string) => {
      console.log(`\n⚠️  WhatsApp client disconnected: ${reason}\n`);
      logger.warn('WhatsApp client disconnected', { reason });
      this.isReady = false;
      this.client = null;
    });

    // Error handler for unhandled errors
    const errorHandler = (error: unknown) => {
      clearInitTimeout();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isProtocolError = errorMessage.includes('Protocol error') || 
                              errorMessage.includes('Execution context') ||
                              errorMessage.includes('Target closed');
      
      if (isProtocolError) {
        logger.warn('Protocol error during initialization, this may be recoverable', { error });
        // Don't reject immediately for protocol errors - let the timeout handle it
        // The client might still recover
        return;
      }
      
      console.log('\n❌ Failed to initialize WhatsApp client');
      console.log(`   Error: ${errorMessage}\n`);
      logger.error('Failed to initialize WhatsApp client', error);
      this.isInitializing = false;
      if (this.client) {
        this.client.destroy().catch(() => {
          // Ignore cleanup errors
        });
        this.client = null;
      }
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    // Handle client errors
    this.client.on('error', errorHandler);

    // Start initialization
    this.client.initialize()
      .then(() => {
        // Initialization started - waiting for QR code or ready event
        logger.info('WhatsApp client initialization started');
      })
      .catch((error: unknown) => {
        errorHandler(error);
      });
  }

  async send(message: string, options?: SendOptions): Promise<SendResult> {
    try {
      // Initialize client if needed
      await this.initializeClient();

      if (!this.client || !this.isReady) {
        return {
          success: false,
          error: new Error('WhatsApp client is not ready'),
        };
      }

      // Verify client state before sending
      try {
        const state = await this.client.getState();
        if (state !== 'CONNECTED' && state !== 'OPENING') {
          logger.warn('Client not in connected state, reinitializing', { state });
          this.isReady = false;
          this.client = null;
          await this.initializeClient();
          
          if (!this.client || !this.isReady) {
            return {
              success: false,
              error: new Error('WhatsApp client failed to reconnect'),
            };
          }
        }
      } catch (stateError) {
        logger.warn('Failed to check client state, attempting to reinitialize', { error: stateError });
        this.isReady = false;
        this.client = null;
        await this.initializeClient();
        
        if (!this.client || !this.isReady) {
          return {
            success: false,
            error: new Error('WhatsApp client failed to reconnect'),
          };
        }
      }

      // Use group ID from config or from options
      let groupId = options?.recipients?.[0] || this.config.whatsapp.groupId;

      // If groupId looks like a name (contains spaces or doesn't match ID pattern), search for it
      if (groupId && !groupId.includes('@') && (groupId.includes(' ') || !/^\d+$/.test(groupId))) {
        logger.info(`Searching for group by name: ${groupId}`);
        const foundGroupId = await this.findGroupByName(groupId);
        if (foundGroupId) {
          groupId = foundGroupId;
          logger.info(`Found group ID: ${foundGroupId}`);
        } else {
          return {
            success: false,
            error: new Error(`Group "${groupId}" not found`),
          };
        }
      }

      if (!groupId) {
        return {
          success: false,
          error: new Error('No WhatsApp group ID specified. Set WHATSAPP_GROUP_ID in .env or provide recipients in options'),
        };
      }

      // Send message to group
      const chatId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
      
      // Retry logic for protocol errors
      let lastError: Error | null = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Double-check client is still valid
          if (!this.client) {
            throw new Error('Client was destroyed during send operation');
          }

          const result = await this.client.sendMessage(chatId, message);

          logger.info('WhatsApp message sent successfully', {
            groupId: chatId,
            messageId: result.id._serialized,
            attempt,
          });

          return {
            success: true,
            messageId: result.id._serialized,
            recipient: chatId,
            metadata: {
              timestamp: new Date().toISOString(),
              from: result.from,
            },
          };
        } catch (sendError) {
          lastError = sendError instanceof Error ? sendError : new Error(String(sendError));
          
          // Check if it's a protocol/context error that might be recoverable
          const isProtocolError = lastError.message.includes('Protocol error') || 
                                  lastError.message.includes('Execution context') ||
                                  lastError.message.includes('Target closed');
          
          if (isProtocolError && attempt < maxRetries) {
            logger.warn(`WhatsApp send attempt ${attempt} failed, retrying...`, {
              error: lastError.message,
            });
            
            // Try to reinitialize if client is invalid
            if (!this.client || !this.isReady) {
              logger.info('Client invalid after protocol error, reinitializing...');
              this.isReady = false;
              this.client = null;
              await this.initializeClient();
            }
            
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }
          
          // If not retryable or last attempt, throw
          throw lastError;
        }
      }
      
      // Should never reach here, but TypeScript needs it
      throw lastError || new Error('Failed to send message after retries');
    } catch (error) {
      logger.error('Error sending WhatsApp message', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Find a group by name
   * @param groupName - Name of the group to find
   * @returns Group ID if found, null otherwise
   */
  async findGroupByName(groupName: string): Promise<string | null> {
    try {
      await this.initializeClient();

      if (!this.client || !this.isReady) {
        throw new Error('WhatsApp client is not ready');
      }

      // Get all chats
      const chats = await this.client.getChats();
      
      // Find group with matching name
      const group = chats.find(chat => 
        chat.isGroup && chat.name.toLowerCase() === groupName.toLowerCase()
      );

      if (group) {
        return group.id._serialized;
      }

      return null;
    } catch (error) {
      logger.error('Error finding group by name', error);
      throw error;
    }
  }

  isAvailable(): boolean {
    // Check if group ID is configured
    return !!this.config.whatsapp.groupId;
  }

  getMetadata(): OutputChannelMetadata {
    return {
      name: 'WhatsApp (Web.js)',
      type: 'whatsapp',
      description: 'Sends WhatsApp messages via whatsapp-web.js',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: false, // Groups only, not multiple individual recipients
      capabilities: ['whatsapp', 'group-messaging', 'qr-authentication'],
    };
  }

  /**
   * Cleanup: Destroy client (without logging out to preserve session)
   */
  async destroy(): Promise<void> {
    if (this.client) {
      try {
        // Don't call logout() - that invalidates the session
        // Just destroy the client, which will save the session via LocalAuth
        await this.client.destroy();
      } catch (error) {
        logger.error('Error destroying WhatsApp client', error);
      }
      this.client = null;
      this.isReady = false;
    }
  }
}

