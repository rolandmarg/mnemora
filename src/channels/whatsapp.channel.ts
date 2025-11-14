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
import { trackWhatsAppMessageSent, trackWhatsAppAuthRequired, trackOperationDuration } from '../utils/metrics.js';
import { createWhatsAppSessionStorage } from '../utils/s3-storage.js';
import { authReminder } from '../utils/auth-reminder.js';
import {
  sendWhatsAppAuthRequiredAlert,
  sendWhatsAppClientInitFailedAlert,
  sendWhatsAppGroupNotFoundAlert,
  sendWhatsAppMessageFailedAlert,
  sendWhatsAppAuthRefreshNeededAlert,
} from '../utils/alerting.js';
import { logSentMessage } from '../utils/message-logger.js';
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
  private readonly sessionStorage: ReturnType<typeof createWhatsAppSessionStorage>;
  private readonly isLambda: boolean;
  private authRequired: boolean = false;

  constructor(config: AppConfig) {
    super();
    this.config = config;
    this.isLambda = !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ??
      process.env.LAMBDA_TASK_ROOT ??
      process.env.AWS_EXECUTION_ENV
    );
    
    // Store session data in .wwebjs_auth directory
    this.sessionPath = join(process.cwd(), '.wwebjs_auth');
    this.sessionStorage = createWhatsAppSessionStorage();
    
    // Ensure session directory exists (for local development)
    if (!this.isLambda && !existsSync(this.sessionPath)) {
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
    let initTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
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

    // QR Code event - display in terminal or CloudWatch Logs
    this.client.on('qr', (qr: string) => {
      clearInitTimeout(); // Reset timeout when QR is shown
      trackWhatsAppAuthRequired();
      this.authRequired = true;
      
      // Send alert that authentication is required
      sendWhatsAppAuthRequiredAlert({
        qrCodeAvailable: true,
        environment: this.isLambda ? 'lambda' : 'local',
      });

      if (this.isLambda) {
        // In Lambda: Output QR code as structured JSON to CloudWatch Logs
        logger.warn('🔐 WHATSAPP AUTHENTICATION REQUIRED - QR CODE IN LOGS', {
          qrCode: qr,
          instructions: [
            '1. Open CloudWatch Logs and find this log entry',
            '2. Copy the qrCode value from the log',
            '3. Open WhatsApp on your phone',
            '4. Go to Settings > Linked Devices',
            '5. Tap "Link a Device"',
            '6. Use a QR code generator to display the code and scan it',
            `7. Or use: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${  encodeURIComponent(qr)}`,
          ],
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`,
          note: 'Lambda will timeout, but session will be saved to S3. Next invocation will use saved session.',
        });
        
        // Also log QR code in a format that can be easily extracted
        logger.info('QR_CODE_FOR_SCANNING', {
          qrCode: qr,
          format: 'base64',
        });
      } else {
        // Local: Display QR code in terminal
        console.log(`\n${  '='.repeat(60)}`);
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
      
      logger.info('QR code displayed - waiting for user to scan', { 
        qrCode: qr,
        environment: this.isLambda ? 'lambda' : 'local',
      });
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
    this.client.on('ready', async () => {
      clearInitTimeout();
      this.authRequired = false;
      
      if (!this.isLambda) {
        console.log('✅ WhatsApp client is ready!');
        console.log('💾 Session saved - you won\'t need to scan QR code again\n');
      }
      
      logger.info('WhatsApp client is ready');
      
      // Record authentication in reminder system
      await authReminder.recordAuthentication().catch(() => {
        // Ignore errors - non-critical
      });
      
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
      const error = new Error(`WhatsApp authentication failed: ${msg}`);
      sendWhatsAppClientInitFailedAlert(error, {
        reason: 'auth_failure',
        message: msg,
      });
      reject(error);
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
      const initError = error instanceof Error ? error : new Error(String(error));
      sendWhatsAppClientInitFailedAlert(initError, {
        reason: 'initialization_error',
        errorMessage,
      });
      reject(initError);
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
    const startTime = Date.now();
    try {
      // Check if auth refresh is needed
      await authReminder.checkAndEmitReminder().catch(() => {
        // Ignore errors - non-critical
      });
      
      // Get auth status and send INFO alert if refresh needed (7+ days)
      const authStatus = await authReminder.getAuthStatus().catch(() => null);
      if (authStatus?.needsRefresh) {
        sendWhatsAppAuthRefreshNeededAlert(authStatus.daysSinceAuth, {
          lastAuthDate: authStatus.lastAuthDate?.toISOString(),
        });
      }

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
      let groupId = options?.recipients?.[0] ?? this.config.whatsapp.groupId;

      // If groupId looks like a name (contains spaces or doesn't match ID pattern), search for it
      if (groupId && !groupId.includes('@') && (groupId.includes(' ') || !/^\d+$/.test(groupId))) {
        logger.info(`Searching for group by name: ${groupId}`);
        const foundGroupId = await this.findGroupByName(groupId);
        
        if (foundGroupId) {
          groupId = foundGroupId;
          logger.info(`Found group ID: ${foundGroupId}`);
        } else {
          const error = new Error(`Group "${groupId}" not found`);
          sendWhatsAppGroupNotFoundAlert(groupId, {
            searchedName: groupId,
          });
          return {
            success: false,
            error,
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

          const duration = Date.now() - startTime;
          trackWhatsAppMessageSent(true);
          trackOperationDuration('whatsapp.send', duration, { success: 'true', attempt: attempt.toString() });

          logger.info('WhatsApp message sent successfully', {
            groupId: chatId,
            messageId: result.id._serialized,
            attempt,
            duration,
          });

          // Log and persist message (full content)
          await logSentMessage(
            result.id._serialized,
            'other', // Will be set by caller if known
            chatId,
            message,
            true,
            duration,
            undefined,
            {
              attempt,
              from: result.from,
            }
          ).catch(() => {
            // Ignore errors - message logging is non-critical
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
      throw lastError ?? new Error('Failed to send message after retries');
    } catch (error) {
      const duration = Date.now() - startTime;
      trackWhatsAppMessageSent(false);
      trackOperationDuration('whatsapp.send', duration, { success: 'false' });
      logger.error('Error sending WhatsApp message', error);
      
      // Send alert for message send failure (after all retries)
      sendWhatsAppMessageFailedAlert(error, {
        groupId: options?.recipients?.[0] ?? this.config.whatsapp.groupId,
        retries: 3, // maxRetries constant
      });

      // Log and persist failed message (full content)
      await logSentMessage(
        undefined,
        'other', // Will be set by caller if known
        options?.recipients?.[0] ?? this.config.whatsapp.groupId ?? 'unknown',
        message,
        false,
        duration,
        error,
        {
          retries: 3,
        }
      ).catch(() => {
        // Ignore errors - message logging is non-critical
      });
      
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

  /**
   * Check if authentication is required
   */
  async requiresAuth(): Promise<boolean> {
    // Check auth reminder system
    const needsRefresh = await authReminder.isRefreshNeeded();
    if (needsRefresh) {
      return true;
    }

    // Check if client needs authentication
    if (this.authRequired) {
      return true;
    }

    // Check if session exists
    if (this.isLambda) {
      // In Lambda, check S3 for session
      const sessionExists = await this.sessionStorage.fileExists('session.json').catch(() => false);
      return !sessionExists;
    }
    
    // Local: check filesystem
    const sessionFile = join(this.sessionPath, 'session.json');
    return !existsSync(sessionFile);
  }

  /**
   * Get authentication status
   */
  async getAuthStatus(): Promise<{
    isReady: boolean;
    requiresAuth: boolean;
    authRequired: boolean;
    lastAuthDate: Date | null;
    daysSinceAuth: number | null;
  }> {
    const authStatus = await authReminder.getAuthStatus();
    
    return {
      isReady: this.isReady,
      requiresAuth: await this.requiresAuth(),
      authRequired: this.authRequired,
      lastAuthDate: authStatus.lastAuthDate,
      daysSinceAuth: authStatus.daysSinceAuth,
    };
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

