/**
 * Output Channel Interface
 * 
 * Defines the contract for all output channels (Console, SMS, WhatsApp, Email, etc.)
 * Any new output channel must implement this interface.
 */

export interface SendOptions {
  recipients?: string[];
  subject?: string;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  recipient?: string;
  error?: Error;
  metadata?: Record<string, unknown>;
}

export interface OutputChannelMetadata {
  name: string;
  type: string;
  description: string;
  supportsSingleRecipient: boolean;
  supportsMultipleRecipients: boolean;
  capabilities: string[];
}

/**
 * Output channel interface for sending messages
 * 
 * All output channels (Console, SMS, WhatsApp, Email) implement this interface
 */
export interface OutputChannel {
  /**
   * Send a message to a single recipient
   * @param message - The message content to send
   * @param options - Optional parameters (recipient, subject, etc.)
   * @returns Promise resolving to send result
   */
  send(message: string, options?: SendOptions): Promise<SendResult>;

  /**
   * Send a message to multiple recipients
   * @param recipients - Array of recipient identifiers (phone numbers, emails, etc.)
   * @param message - The message content to send
   * @param options - Optional parameters (subject, priority, etc.)
   * @returns Promise resolving to array of send results (one per recipient)
   */
  sendToMultiple(recipients: string[], message: string, options?: SendOptions): Promise<SendResult[]>;

  /**
   * Check if the output channel is available and properly configured
   * @returns true if channel is available, false otherwise
   */
  isAvailable(): boolean;

  /**
   * Get metadata about this output channel
   * @returns Metadata object describing the channel
   */
  getMetadata(): OutputChannelMetadata;
}

