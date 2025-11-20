import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { isLambda } from '../utils/runtime.util.js';
import { QRAuthenticationRequiredError } from '../types/qr-auth-error.js';
import { displayQRCode } from '../utils/qr-code.util.js';

class WhatsAppClient {
  private sock: WASocket | null = null;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  private readonly sessionPath: string;
  private readonly isLambda: boolean;
  private authRequired: boolean = false;
  private saveCreds: (() => Promise<void>) | null = null;

  constructor() {
    this.isLambda = isLambda();
    // Use /tmp in Lambda (writable), process.cwd() locally
    // Baileys uses 'auth_info' directory by default
    this.sessionPath = this.isLambda 
      ? join('/tmp', 'auth_info')
      : join(process.cwd(), 'auth_info');
    
    // Create directory structure if it doesn't exist
    if (!existsSync(this.sessionPath)) {
      mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  /**
   * Get the session path. Useful for external session management (e.g., S3 sync)
   */
  getSessionPath(): string {
    return this.sessionPath;
  }

  async initialize(): Promise<void> {
    if (this.isReady && this.sock) {
      try {
        const state = this.sock.user;
        if (state) {
          return;
        }
      } catch (_error) {
        this.sock = null;
        this.isReady = false;
      }
    }

    if (this.isInitializing) {
      return new Promise((resolve, reject) => {
        const checkReady = setInterval(() => {
          if (this.isReady && this.sock) {
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

    return new Promise((resolve, reject) => {
      (async () => {
        try {
          if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
          }

          // Load auth state
          const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
          this.saveCreds = saveCreds;

          // Fetch latest version
          const { version } = await fetchLatestBaileysVersion();
          
          // Create socket
          // Note: Some decryption errors from libsignal (the underlying encryption library)
          // may appear in console output. These are expected and non-fatal - they occur
          // when Baileys receives messages it can't decrypt (usually from before session
          // was established or from other devices). They don't affect message sending.
          this.sock = makeWASocket({
            version,
            auth: {
              creds: state.creds,
              keys: makeCacheableSignalKeyStore(state.keys),
            },
            // Minimal configuration - send-only mode
            // These options minimize unnecessary operations like read receipts syncing,
            // message history syncing, presence updates, and other background operations.
            // This reduces S3 session file updates and improves performance.
            syncFullHistory: false,              // Don't sync full message history
            markOnlineOnConnect: false,          // Don't mark as online automatically
            fireInitQueries: false,               // Don't fire initialization queries
            shouldSyncHistoryMessage: () => false, // Don't sync history messages
            shouldIgnoreJid: () => true,          // Ignore all incoming messages (send-only)
            getMessage: async () => undefined,    // Don't fetch messages
            connectTimeoutMs: 60000,              // Connection timeout
            defaultQueryTimeoutMs: 60000,         // Query timeout
            // Don't use printQRInTerminal (deprecated) - we handle QR manually for consistency
          });

          // Save credentials when they update
          this.sock.ev.on('creds.update', async () => {
            if (this.saveCreds) {
              await this.saveCreds();
            }
          });

          this.setupSocketEvents(resolve, reject);
        } catch (error) {
          this.isInitializing = false;
          this.sock = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }

  private setupSocketEvents(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.sock) {
      reject(new Error('Failed to create WhatsApp socket'));
      return;
    }

    // Set a timeout for initialization (3 minutes)
    let initTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!this.isReady) {
        this.isInitializing = false;
        if (this.sock) {
          this.sock.end(undefined);
          this.sock = null;
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

    // Handle connection updates (QR, connection state, errors)
    this.sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code
      if (qr) {
        clearInitTimeout();
        this.authRequired = true;
        
        // Common instructions
        const instructions = [
          '1. Open WhatsApp on your phone',
          '2. Go to Settings > Linked Devices',
          '3. Tap "Link a Device"',
          '4. Scan the QR code below',
        ];
        
        // Generate QR code for local environment
        if (!this.isLambda) {
          try {
            console.log('\n\n');
            console.log(`\n${'='.repeat(60)}`);
            console.log('🔐 WHATSAPP AUTHENTICATION REQUIRED');
            console.log('='.repeat(60));
            console.log('\n📱 Please scan the QR code below with your WhatsApp mobile app:');
            instructions.forEach(instruction => console.log(`   ${instruction}`));
            console.log('\n');
            console.log('-'.repeat(60));
            console.log(''); // Extra blank line before QR code
            displayQRCode(qr);
            console.log(''); // Extra blank line after QR code
            console.log('-'.repeat(60));
            console.log('\n⏳ Waiting for you to scan the QR code...');
            console.log('💡 Keep this terminal open while scanning\n');
          } catch (error) {
            console.error('Error generating QR code:', error);
            console.log('\nQR Code string (fallback):', qr);
            console.log('Please use a QR code generator with the string above');
          }
        } else {
          // In Lambda, throw error immediately - let the handler log the QR code
          throw new QRAuthenticationRequiredError(qr);
        }
      }

      // Handle connection open
      if (connection === 'open') {
        clearInitTimeout();
        this.isReady = true;
        this.isInitializing = false;
        this.authRequired = false;
        console.log('✅ WhatsApp client is ready!');
        resolve();
      }

      // Handle connection close
      if (connection === 'close') {
        const error = lastDisconnect?.error;
        // Extract status code from Baileys error (which uses Boom error structure)
        const statusCode = error && 
          typeof error === 'object' && 
          'output' in error && 
          typeof (error as { output?: { statusCode?: number } }).output === 'object'
          ? (error as { output: { statusCode?: number } }).output?.statusCode
          : undefined;
        
        // Handle 401 errors (logged out or device_removed) - both require clearing session and new QR code
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          // Logged out or device removed - clear session and reinitialize to get new QR code
          const isDeviceRemoved = error && 'data' in error && 
            typeof (error as { data?: unknown }).data === 'object' &&
            JSON.stringify((error as { data?: unknown }).data).includes('device_removed');
          
          console.log(isDeviceRemoved 
            ? '🔄 Device was removed from WhatsApp - clearing session and requesting new QR code...'
            : '🔄 Session logged out - clearing session and requesting new QR code...');
          
          clearInitTimeout();
          this.isInitializing = false;
          this.isReady = false;
          
          // Clean up current socket
          if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
          }
          
          // Clear the session directory
          try {
            if (existsSync(this.sessionPath)) {
              rmSync(this.sessionPath, { recursive: true, force: true });
              console.log('✅ Session cleared');
            }
          } catch (clearError) {
            console.error('Error clearing session:', clearError);
          }
          
          // Reinitialize to get a new QR code
          setTimeout(async () => {
            try {
              await this.initialize();
              resolve();
            } catch (reinitError) {
              reject(reinitError instanceof Error ? reinitError : new Error(String(reinitError)));
            }
          }, 1000);
        } else if (statusCode === DisconnectReason.badSession) {
          console.error('Bad session, deleting and restarting...');
          // Session will be recreated on next init
          this.isReady = false;
        } else if (statusCode === DisconnectReason.connectionReplaced) {
          console.error('Connection replaced by another device');
          this.isReady = false;
          this.sock = null;
        } else if (statusCode === DisconnectReason.restartRequired) {
          // After successful pairing, Baileys requires a restart
          // Close current socket and reinitialize with saved credentials
          console.log('🔄 Restart required after pairing - reinitializing connection...');
          clearInitTimeout();
          this.isInitializing = false;
          this.isReady = false;
          
          // Clean up current socket
          if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
          }
          
          // Reinitialize with saved credentials (will use existing auth state)
          // Use setTimeout to avoid stack overflow and allow event loop to process
          setTimeout(async () => {
            try {
              await this.initialize();
              resolve();
            } catch (reinitError) {
              reject(reinitError instanceof Error ? reinitError : new Error(String(reinitError)));
            }
          }, 1000);
        } else {
          // Other close reasons (connectionClosed, connectionLost, timedOut)
          // Will reconnect automatically, just mark as not ready
          this.isReady = false;
        }
      }
    });
  }

  getClient(): WASocket {
    if (!this.sock || !this.isReady) {
      throw new Error('WhatsApp client is not initialized. Call initialize() first.');
    }
    return this.sock;
  }

  isClientReady(): boolean {
    return this.isReady && this.sock !== null;
  }

  requiresAuth(): boolean {
    return this.authRequired || !this.isReady;
  }

  async findGroupByName(groupName: string): Promise<{ id: string; name: string } | null> {
    const sock = this.getClient();
    
    try {
      const groups = await sock.groupFetchAllParticipating();
      
      for (const [groupId, group] of Object.entries(groups)) {
        const groupData = group as { subject?: string };
        if (groupData.subject === groupName) {
          return {
            id: groupId,
            name: groupData.subject ?? groupName,
          };
        }
      }
      
      return null;
    } catch (error) {
      throw new Error(`Failed to find group: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sendMessage(chatId: string, message: string): Promise<{ id: string; from: string }> {
    const sock = this.getClient();
    
    try {
      // Ensure chatId has @g.us suffix for groups
      const normalizedChatId = chatId.includes('@g.us') ? chatId : `${chatId}@g.us`;
      
      const result = await sock.sendMessage(normalizedChatId, { text: message });
      
      if (!result) {
        throw new Error('Failed to send message: no result returned');
      }
      
      return {
        id: result.key.id ?? '',
        from: result.key.remoteJid ?? normalizedChatId,
      };
    } catch (error) {
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async destroy(): Promise<void> {
    if (this.sock) {
      try {
        // Wait longer for any pending operations (retry requests, etc.)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // End the connection gracefully
        this.sock.end(undefined);
        
        // Wait for connection to close
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        // Ignore connection closed errors during cleanup - they're expected
        // when Baileys is still processing background operations
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('Connection Closed') && 
            !errorMessage.includes('Connection closed') &&
            !errorMessage.includes('Precondition Required')) {
          // Only log unexpected errors
          console.error('Unexpected error during WhatsApp client cleanup:', errorMessage);
        }
      } finally {
        this.sock = null;
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
