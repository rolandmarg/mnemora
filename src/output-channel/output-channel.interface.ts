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

export interface OutputChannel {
  send(message: string, options?: SendOptions): Promise<SendResult>;
  sendToMultiple(recipients: string[], message: string, options?: SendOptions): Promise<SendResult[]>;
  isAvailable(): boolean;
  getMetadata(): OutputChannelMetadata;
}

