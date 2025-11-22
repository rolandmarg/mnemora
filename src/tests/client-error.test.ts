import { describe, it, expect } from 'vitest';
import { ClientError } from '../clients/errors/client-error.js';

describe('ClientError', () => {
  describe('constructor', () => {
    it('should create error with client name and message', () => {
      const error = new ClientError({
        clientName: 'TestClient',
        message: 'Test error message',
      });
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ClientError);
      expect(error.name).toBe('TestClientError');
      expect(error.message).toBe('Test error message');
      expect(error.clientName).toBe('TestClient');
    });

    it('should format client name correctly in error name', () => {
      const error1 = new ClientError({
        clientName: 'GoogleCalendar',
        message: 'Test error',
      });
      expect(error1.name).toBe('GoogleCalendarError');
      
      const error2 = new ClientError({
        clientName: 'S3',
        message: 'Test error',
      });
      expect(error2.name).toBe('S3Error');
    });

    it('should include cause error if provided', () => {
      const cause = new Error('Original error');
      const error = new ClientError({
        clientName: 'TestClient',
        message: 'Wrapper error',
        cause,
      });
      
      expect(error.cause).toBe(cause);
      expect(error.message).toBe('Wrapper error');
      expect(error.stack).toContain('Caused by:');
      expect(error.stack).toContain('Original error');
    });

    it('should include metadata if provided', () => {
      const metadata = { key1: 'value1', key2: 123, key3: true };
      const error = new ClientError({
        clientName: 'TestClient',
        message: 'Test error',
        metadata,
      });
      
      expect(error.metadata).toEqual(metadata);
      expect(error.metadata?.key1).toBe('value1');
      expect(error.metadata?.key2).toBe(123);
      expect(error.metadata?.key3).toBe(true);
    });

    it('should handle all properties together', () => {
      const cause = new Error('Original error');
      const metadata = { operation: 'fetchData', retryCount: 3 };
      const error = new ClientError({
        clientName: 'TestClient',
        message: 'Operation failed',
        cause,
        metadata,
      });
      
      expect(error.name).toBe('TestClientError');
      expect(error.clientName).toBe('TestClient');
      expect(error.message).toBe('Operation failed');
      expect(error.cause).toBe(cause);
      expect(error.metadata).toEqual(metadata);
    });

    it('should preserve stack trace', () => {
      const error = new ClientError({
        clientName: 'TestClient',
        message: 'Test error',
      });
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ClientError');
    });
  });
});

