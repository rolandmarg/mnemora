/**
 * Base Output Channel
 * 
 * Abstract base class for all output channels
 * Provides common functionality and enforces interface implementation
 */

// External dependencies
// (none)

// Internal modules - Types
import type { OutputChannel, SendOptions, SendResult, OutputChannelMetadata } from './output-channel.interface.js';

/**
 * Abstract base class for output channels
 * 
 * Provides common functionality and enforces interface implementation
 * All output channels should extend this class
 */
export abstract class BaseOutputChannel implements OutputChannel {
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

  abstract isAvailable(): boolean;

  abstract getMetadata(): OutputChannelMetadata;
}

