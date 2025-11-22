import { describe, it, expect, beforeEach } from 'vitest';
import { BaseClient, type XRayClientInterface } from '../clients/base.client.js';
import { ClientError } from '../clients/errors/client-error.js';
import type { AppConfig } from '../config.js';

interface SubsegmentLike {
  addMetadata(key: string, value: unknown): void;
  addError(error: Error): void;
  close(): void;
}

// Mock X-Ray client
class MockXRayClient implements XRayClientInterface {
  private capturedSegments: Array<{
    name: string;
    metadata?: Record<string, unknown>;
  }> = [];

  async captureAsyncSegment<T>(
    name: string,
    operation: (subsegment: SubsegmentLike) => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    this.capturedSegments.push({ name, metadata });
    const mockSubsegment = {} as SubsegmentLike;
    return operation(mockSubsegment);
  }

  getCapturedSegments() {
    return this.capturedSegments;
  }

  clearCapturedSegments() {
    this.capturedSegments = [];
  }
}

// Mock config
const mockConfig: AppConfig = {
  google: {
    calendarId: 'primary',
    spreadsheetId: undefined,
    clientEmail: 'test@example.com',
    privateKey: 'test-key',
    projectId: undefined,
  },
  whatsapp: {
    groupId: undefined,
  },
  schedule: {
    time: '09:00',
    timezone: 'America/Los_Angeles',
  },
  aws: {
    region: 'us-west-1',
    s3Bucket: undefined,
    snsTopicArn: undefined,
    cloudWatchLogGroup: undefined,
    enableXRay: true,
  },
  metrics: {
    namespace: 'Test',
    enabled: true,
  },
  logging: {
    level: 'info',
    pretty: false,
  },
  environment: 'test',
};

// Concrete implementation for testing
class TestClient extends BaseClient {
  constructor(config: AppConfig, xrayClient: XRayClientInterface) {
    super(config, xrayClient);
  }

  // Expose protected methods for testing
  testCreateError(
    clientName: string,
    message: string,
    cause?: Error,
    metadata?: Record<string, unknown>
  ): ClientError {
    return this.createError(clientName, message, cause, metadata);
  }

  async testCaptureSegment<T>(
    clientName: string,
    operationName: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    return this.captureSegment(clientName, operationName, operation, metadata);
  }
}

describe('BaseClient', () => {
  let mockXRayClient: MockXRayClient;
  let testClient: TestClient;

  beforeEach(() => {
    mockXRayClient = new MockXRayClient();
    testClient = new TestClient(mockConfig, mockXRayClient);
    mockXRayClient.clearCapturedSegments();
  });

  describe('constructor', () => {
    it('should initialize with config and xrayClient', () => {
      const client = new TestClient(mockConfig, mockXRayClient);
      
      expect(client['config']).toBe(mockConfig);
      expect(client['xrayClient']).toBe(mockXRayClient);
      expect(typeof client['isLambda']).toBe('boolean');
    });

    it('should detect lambda runtime', () => {
      const client = new TestClient(mockConfig, mockXRayClient);
      
      // isLambda is set during construction
      expect(client['isLambda']).toBeDefined();
    });
  });

  describe('createError', () => {
    it('should create ClientError with client name', () => {
      const error = testClient.testCreateError('TestClient', 'Test error message');
      
      expect(error).toBeInstanceOf(ClientError);
      expect(error.name).toBe('TestClientError');
      expect(error.message).toBe('Test error message');
      expect(error.clientName).toBe('TestClient');
    });

    it('should include cause in error', () => {
      const cause = new Error('Original error');
      const error = testClient.testCreateError('TestClient', 'Wrapper error', cause);
      
      expect(error.cause).toBe(cause);
    });

    it('should include metadata in error', () => {
      const metadata = { key: 'value', count: 42 };
      const error = testClient.testCreateError('TestClient', 'Error with metadata', undefined, metadata);
      
      expect(error.metadata).toEqual(metadata);
    });

    it('should include all properties in error', () => {
      const cause = new Error('Original');
      const metadata = { operation: 'test' };
      const error = testClient.testCreateError('TestClient', 'Full error', cause, metadata);
      
      expect(error.name).toBe('TestClientError');
      expect(error.clientName).toBe('TestClient');
      expect(error.message).toBe('Full error');
      expect(error.cause).toBe(cause);
      expect(error.metadata).toEqual(metadata);
    });
  });

  describe('captureSegment', () => {
    it('should wrap operation with X-Ray tracing', async () => {
      const operation = async () => 'result';

      const result = await testClient.testCaptureSegment('TestClient', 'testOperation', operation);

      expect(result).toBe('result');
      expect(mockXRayClient.getCapturedSegments()).toHaveLength(1);
      expect(mockXRayClient.getCapturedSegments()[0].name).toBe('TestClient.testOperation');
    });

    it('should include metadata in trace', async () => {
      const operation = async () => ({ data: 'test' });
      const metadata = { userId: '123', action: 'test' };

      await testClient.testCaptureSegment('TestClient', 'testOperation', operation, metadata);

      const segments = mockXRayClient.getCapturedSegments();
      expect(segments).toHaveLength(1);
      expect(segments[0].metadata).toEqual(metadata);
    });

    it('should handle async operations correctly', async () => {
      let executed = false;
      const operation = async () => {
        executed = true;
        return Promise.resolve(42);
      };

      const result = await testClient.testCaptureSegment('TestClient', 'asyncOperation', operation);

      expect(result).toBe(42);
      expect(executed).toBe(true);
    });

    it('should propagate errors from operation', async () => {
      const operation = async () => {
        throw new Error('Operation failed');
      };

      await expect(
        testClient.testCaptureSegment('TestClient', 'failingOperation', operation)
      ).rejects.toThrow('Operation failed');
    });

    it('should prefix operation name with client name', async () => {
      const operation = async () => 'result';
      
      await testClient.testCaptureSegment('TestClient', 'myOperation', operation);
      
      const segments = mockXRayClient.getCapturedSegments();
      expect(segments[0].name).toBe('TestClient.myOperation');
    });
  });
});
