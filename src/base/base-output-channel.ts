/**
 * Base Output Channel
 * 
 * Abstract base class for all output channels
 * Provides common functionality and enforces interface implementation
 */

import type { IOutputChannel, SendOptions, SendResult, OutputChannelMetadata } from '../interfaces/output-channel.interface.js';

/**
 * Abstract base class for output channels
 * 
 * Provides common functionality and enforces interface implementation
 * All output channels should extend this class
 */
export abstract class BaseOutputChannel implements IOutputChannel {
  /**
   * Send a message to a single recipient
   * Must be implemented by subclasses
   */
  abstract send(message: string, options?: SendOptions): Promise<SendResult>;

  /**
   * Send a message to multiple recipients
   * Default implementation sends to each recipient individually
   * Override in subclasses for optimized batch sending
   */
  async sendToMultiple(recipients: string[], message: string, options?: SendOptions): Promise<SendResult[]> {
    return Promise.all(
      recipients.map(recipient => 
        this.send(message, { ...options, recipients: [recipient] })
      )
    );
  }

  /**
   * Check if the output channel is available and properly configured
   * Must be implemented by subclasses
   */
  abstract isAvailable(): boolean;

  /**
   * Get metadata about this output channel
   * Must be implemented by subclasses
   */
  abstract getMetadata(): OutputChannelMetadata;
}

