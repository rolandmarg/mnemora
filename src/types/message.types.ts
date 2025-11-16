export type MessageType = 'birthday' | 'monthly-digest' | 'test' | 'other';

export interface MessageRecord {
  messageId?: string;
  timestamp: string;
  messageType: MessageType;
  recipient: string;
  content: string;
  success: boolean;
  duration?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

