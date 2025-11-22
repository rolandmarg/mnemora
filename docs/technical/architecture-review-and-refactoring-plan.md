# Architecture Review & Refactoring Plan

**Date:** 2025-01-XX  
**Status:** Actionable Recommendations  
**Priority:** High

## Executive Summary

This document provides a comprehensive analysis of the current Mnemora architecture, identifies tech debt and complexity issues, and outlines a strategic refactoring plan to support multi-channel input/output capabilities with seamless configuration management for Lambda functions.

## 1. Current Architecture State

### 1.1 Architecture Layers

The codebase follows a clear layered architecture:

```
┌─────────────────────────────────────┐
│   Lambda Handlers / Scripts         │  ← Entry points
├─────────────────────────────────────┤
│   Services (Business Logic)         │  ← Orchestration
├─────────────────────────────────────┤
│   Data Sources / Output Channels    │  ← Abstractions
├─────────────────────────────────────┤
│   Clients (API Wrappers)            │  ← External integrations
└─────────────────────────────────────┘
```

#### Components:

1. **Clients** (`src/clients/`) - External API wrappers
   - `google-calendar.client.ts` - Google Calendar API
   - `google-sheets.client.ts` - Google Sheets API
   - `whatsapp.client.ts` - WhatsApp Web.js (Baileys)
   - `s3.client.ts` - AWS S3 storage
   - `sns.client.ts` - AWS SNS notifications
   - `cloudwatch.client.ts` - AWS CloudWatch metrics
   - `xray.client.ts` - AWS X-Ray tracing

2. **Data Sources** (`src/data-source/`) - Input abstraction layer
   - `calendar.source.ts` - Calendar-based birthdays
   - `sheets.source.ts` - Sheets-based birthdays
   - Base classes and interfaces exist

3. **Output Channels** (`src/output-channel/`) - Output abstraction layer
   - `whatsapp.channel.ts` - WhatsApp messaging
   - `console.channel.ts` - Console logging
   - Base classes and interfaces exist

4. **Services** (`src/services/`) - Business logic
   - `birthday-orchestrator.service.ts` - Main orchestration
   - `birthday.service.ts` - Birthday business logic
   - `alerting.service.ts` - Alerting system
   - `metrics.service.ts` - Metrics collection

5. **Lambda Handlers** (`src/lambda/`) - AWS Lambda entry points
   - `handler.ts` - Main birthday check handler
   - `daily-summary-handler.ts` - Daily summary handler

### 1.2 Current Strengths

✅ **Clear separation of concerns** - Well-defined layers  
✅ **Factory patterns** - Data sources and output channels use factories  
✅ **Lazy initialization** - Prevents unnecessary resource loading  
✅ **X-Ray integration** - Distributed tracing implemented  
✅ **Type safety** - Strong TypeScript usage  

## 2. Tech Debt Assessment

### 2.1 Inconsistent Client Patterns 🔴 HIGH PRIORITY

**Problem:** All 7 clients follow different patterns with no common base class.

#### Availability Checking Inconsistency:

- **Pattern A (AWS clients):** Have `isAvailable()` method
  ```typescript
  // S3Client, SNSClient, CloudWatchClient
  isAvailable(): boolean {
    return this.s3Client !== null && this.bucketName !== undefined;
  }
  ```

- **Pattern B (Google clients):** Throw errors on missing config
  ```typescript
  // GoogleCalendarClient, GoogleSheetsClient
  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar credentials not configured...');
  }
  ```

#### Initialization Patterns:

- **Eager initialization:** AWS clients initialize in constructor
- **Lazy initialization:** Google clients initialize on first method call
- **Mixed initialization:** WhatsApp client has complex async initialization

#### Error Handling:

- Inconsistent error messages
- Different error types thrown
- No standardized error handling

#### X-Ray Tracing Duplication:

Every client method manually wraps operations:
```typescript
return xrayClient.captureAsyncSegment('GoogleCalendar.fetchEvents', async () => {
  // implementation
}, { metadata });
```

**Impact:**
- 🔴 High maintenance burden
- 🔴 Inconsistent behavior across clients
- 🔴 Difficult to test
- 🔴 Code duplication (X-Ray, lambda detection, config access)

### 2.2 Dependency Injection Complexity 🟡 MEDIUM-HIGH PRIORITY

**Problem:** Manual dependency wiring throughout the codebase.

#### Current State:

- Clients imported as singletons in multiple places
- Services require explicit client injection (good), but clients still accessed directly (bad)
- Orchestrator constructor takes 7+ dependencies:

```typescript
interface BirthdayOrchestratorServiceOptions {
  logger: Logger;
  config: AppConfig;
  calendarClient: CalendarClient;
  xrayClient: XRayClient;
  cloudWatchClient: CloudWatchClient;
  whatsappClient: WhatsAppClient;
  alerting: AlertingService;
}
```

#### Issues:

- Tight coupling between layers
- Difficult to mock for testing
- Configuration changes require code changes
- Hard to add new clients without touching multiple files

**Impact:**
- 🟡 Reduced testability
- 🟡 Increased coupling
- 🟡 Harder to extend

### 2.3 Configuration Coupling 🟡 MEDIUM PRIORITY

**Problem:** Clients directly import and use `config`, reducing flexibility.

#### Current Pattern:
```typescript
import { config } from '../config.js';

// Inside client
const clientEmail = config.google.clientEmail;
const privateKey = config.google.privateKey;
```

#### Issues:

- Cannot test with different configurations
- Configuration changes require code changes
- No runtime configuration switching
- Hard to support multiple environments

**Impact:**
- 🟡 Reduced flexibility
- 🟡 Testing limitations
- 🟡 Configuration management challenges

### 2.4 Lambda Runtime Detection Duplication 🟢 LOW-MEDIUM PRIORITY

**Problem:** `isLambda()` utility called in multiple clients independently.

#### Current Pattern:
```typescript
constructor() {
  this.isLambda = isLambda();
  // ...
}
```

**Impact:**
- 🟢 Minor duplication
- 🟢 Should be centralized in base class

## 3. Complexity Issues

### 3.1 WhatsApp Client Complexity

**Status:** High complexity (~440 lines), but appears necessary due to Baileys library requirements.

**Location:** `src/clients/whatsapp.client.ts`

**Characteristics:**
- Complex authentication flow with QR code handling
- Connection state management
- S3 session synchronization
- Error recovery logic

**Recommendation:** ✅ Keep as-is, but isolate initialization logic better

### 3.2 Partially Utilized Abstractions

#### Data Sources:
- ✅ Base class exists
- ✅ Interface defined
- ⚠️ Only 2 implementations (Calendar, Sheets)
- ⚠️ Not fully leveraged in orchestration

#### Output Channels:
- ✅ Base class exists
- ✅ Interface defined
- ⚠️ Only 2 implementations (WhatsApp, Console)
- ⚠️ Hard to add new channels due to tight coupling

### 3.3 Multiple Abstraction Layers

**Current Flow:**
```
Service → DataSource → Client → API Library
```

**Example:**
```
BirthdayService 
  → CalendarDataSource 
    → GoogleCalendarClient 
      → googleapis library
```

**Analysis:** This is actually good separation, but the client layer needs standardization.

## 4. Refactoring Clients via Common Base Class: Critical Importance

### 4.1 Why This Matters

#### 🔴 **HIGH IMPORTANCE** - Critical for future scalability

Refactoring clients to use a common base class is **the foundation** for:
1. Multi-channel input/output capabilities
2. Consistent error handling and observability
3. Easier testing and mocking
4. Reduced maintenance burden
5. Configuration-driven channel management

### 4.2 Benefits Breakdown

| Benefit | Impact | Effort |
|---------|--------|--------|
| Code consistency | 🔴 High | Low |
| Reduced duplication | 🔴 High | Medium |
| Better testability | 🟡 Medium | Low |
| Easier extension | 🔴 High | Low |
| Centralized observability | 🟡 Medium | Low |

### 4.3 Proposed Base Client Structure

```typescript
/**
 * Base class for all external API clients
 * Provides common functionality: initialization, availability checking,
 * X-Ray tracing, error handling, and configuration management.
 */
abstract class BaseClient {
  protected readonly config: AppConfig;
  protected readonly xrayClient: XRayClient;
  protected readonly isLambda: boolean;
  protected _initialized: boolean = false;
  
  constructor(config: AppConfig, xrayClient: XRayClient) {
    this.config = config;
    this.xrayClient = xrayClient;
    this.isLambda = isLambdaRuntime();
  }
  
  /**
   * Check if client is available/configured
   * Must be implemented by subclasses
   */
  abstract isAvailable(): boolean;
  
  /**
   * Initialize the client
   * Can be overridden for async initialization
   */
  protected initialize(): void | Promise<void> {
    // Default: synchronous initialization
    if (this._initialized) return;
    // Subclasses can override for custom logic
    this._initialized = true;
  }
  
  /**
   * Wrapper for X-Ray tracing of async operations
   */
  protected async captureSegment<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    return this.xrayClient.captureAsyncSegment(
      `${this.getClientName()}.${name}`,
      operation,
      metadata
    );
  }
  
  /**
   * Get client name for logging/tracing
   */
  protected abstract getClientName(): string;
  
  /**
   * Standardized error creation
   */
  protected createError(
    message: string,
    cause?: Error,
    metadata?: Record<string, unknown>
  ): ClientError {
    return new ClientError(this.getClientName(), message, cause, metadata);
  }
  
  /**
   * Validate configuration
   * Subclasses can override for custom validation
   */
  protected validateConfig(): void {
    if (!this.isAvailable()) {
      throw this.createError(
        `Client not available: ${this.getConfigErrorMessage()}`,
        undefined,
        { client: this.getClientName() }
      );
    }
  }
  
  protected abstract getConfigErrorMessage(): string;
}

/**
 * Custom error class for client errors
 */
class ClientError extends Error {
  constructor(
    public readonly clientName: string,
    message: string,
    public readonly cause?: Error,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = `${clientName}Error`;
  }
}
```

### 4.4 Migration Example: GoogleCalendarClient

**Before:**
```typescript
class GoogleCalendarClient {
  private _readOnlyCalendar: CalendarClient | null = null;
  private _readWriteCalendar: CalendarClient | null = null;
  private _calendarId: string | null = null;
  private _initialized = false;

  private initialize(): void {
    if (this._initialized) return;
    const clientEmail = config.google.clientEmail;
    const privateKey = config.google.privateKey;
    // ... initialization logic
  }

  async fetchEvents(options: EventListOptions): Promise<Event[]> {
    return xrayClient.captureAsyncSegment('GoogleCalendar.fetchEvents', async () => {
      // ... implementation
    }, { metadata });
  }
}
```

**After:**
```typescript
class GoogleCalendarClient extends BaseClient {
  private _readOnlyCalendar: CalendarClient | null = null;
  private _readWriteCalendar: CalendarClient | null = null;
  private _calendarId: string | null = null;

  isAvailable(): boolean {
    return !!(
      this.config.google.clientEmail && 
      this.config.google.privateKey &&
      this.config.google.calendarId
    );
  }

  protected getClientName(): string {
    return 'GoogleCalendar';
  }

  protected getConfigErrorMessage(): string {
    return 'GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_CALENDAR_ID must be set';
  }

  protected initialize(): void {
    if (this._initialized) return;
    
    this.validateConfig();
    
    const { clientEmail, privateKey, calendarId } = this.config.google;
    this._calendarId = calendarId!;
    
    // Initialize auth and clients
    const readOnlyAuth = new google.auth.JWT({
      email: clientEmail!,
      key: privateKey!,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    this._readOnlyCalendar = google.calendar({ version: 'v3', auth: readOnlyAuth });
    
    const readWriteAuth = new google.auth.JWT({
      email: clientEmail!,
      key: privateKey!,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    this._readWriteCalendar = google.calendar({ version: 'v3', auth: readWriteAuth });
    
    this._initialized = true;
  }

  async fetchEvents(options: EventListOptions): Promise<Event[]> {
    return this.captureSegment('fetchEvents', async () => {
      this.initialize(); // Ensure initialized
      // ... implementation (no X-Ray wrapper needed)
    }, {
      startDate: options.startDate.toISOString(),
      endDate: options.endDate.toISOString(),
    });
  }
}
```

### 4.5 Impact Analysis

**Files to Modify:** 7 client files

**Estimated Reduction:**
- ~30-40% code reduction through shared logic
- 100% consistency in availability checking
- 100% consistency in error handling
- Unified X-Ray tracing approach

**Risk Level:** 🟢 Low
- Changes are additive (base class)
- Existing functionality preserved
- Can migrate incrementally

## 5. Future Opportunities

### 5.1 Multi-Channel Input/Output Architecture

#### Current State:
- **Input:** Calendar (primary), Sheets (sync source)
- **Output:** WhatsApp (primary), Console (debug)

#### Opportunity:
Enable multiple input and output channels:

**Multi-Channel Input:**
- Calendar (existing)
- Google Sheets (existing)
- REST API endpoints
- Webhooks
- Databases (PostgreSQL, MongoDB)
- Message queues (SQS, RabbitMQ)

**Multi-Channel Output:**
- WhatsApp (existing)
- SMS (Twilio, AWS SNS)
- Email (SendGrid, SES)
- Slack
- Discord
- Microsoft Teams
- Push notifications (APNS, FCM)
- Webhooks
- Console (existing)

**Channel Routing:**
- Route messages based on rules
- Recipient-based routing
- Content-based routing
- Priority-based routing
- Failover/backup channels

### 5.2 Configuration-Driven Channel Management

#### Current Limitation:
Environment variables define which channels are available at build time.

#### Opportunity:
JSON/YAML configuration for dynamic channel registration:

```yaml
channels:
  input:
    - type: calendar
      enabled: true
      config:
        calendarId: "primary"
        credentials:
          type: "service-account"
    - type: webhook
      enabled: false
      endpoint: "/api/birthdays"
      auth:
        type: "bearer"
        
  output:
    - type: whatsapp
      enabled: true
      priority: 1
      config:
        groupId: "120363406100622625@g.us"
      healthCheck:
        enabled: true
        interval: 300
    - type: email
      enabled: false
      priority: 2
      fallback: true
      config:
        provider: "sendgrid"
        apiKey: "${SENDGRID_API_KEY}"
    - type: slack
      enabled: false
      priority: 3
      config:
        webhookUrl: "${SLACK_WEBHOOK_URL}"
```

### 5.3 Plugin/Extension System

#### Opportunity:
Plugin architecture for custom channels:

```typescript
interface ChannelPlugin {
  name: string;
  version: string;
  type: 'input' | 'output';
  
  initialize(config: unknown): Promise<void>;
  send?(message: string, options: SendOptions): Promise<SendResult>;
  read?(options: ReadOptions): Promise<unknown[]>;
  isAvailable(): boolean;
  healthCheck?(): Promise<HealthStatus>;
  destroy?(): Promise<void>;
  
  metadata: ChannelMetadata;
}

// Example plugin registration
ChannelRegistry.register(new SlackChannelPlugin());
ChannelRegistry.register(new DiscordChannelPlugin());
```

## 6. Multi-Channel Lambda Requirements

### 6.1 Configuration Management 🔴 CRITICAL

#### Requirements:

1. **Environment-Based Configuration**
   - Support multiple environments (dev, staging, prod)
   - Environment variables with validation
   - Secrets management (AWS Secrets Manager, Parameter Store)

2. **Runtime Configuration**
   - Reload configuration without deployment
   - Feature flags for channels
   - A/B testing support
   - Configuration versioning

3. **Channel Feature Flags**
   ```typescript
   interface ChannelConfig {
     type: string;
     enabled: boolean;
     priority?: number;
     fallback?: boolean;
     config: Record<string, unknown>;
     featureFlags?: {
       enableRetry: boolean;
       enableCircuitBreaker: boolean;
       enableMetrics: boolean;
     };
   }
   ```

4. **Environment-Specific Channels**
   - Development: Console + WhatsApp
   - Staging: WhatsApp + Email (test)
   - Production: WhatsApp + SMS (fallback) + Email

### 6.2 Channel Health & Resilience 🟡 IMPORTANT

#### Requirements:

1. **Health Checks**
   - Per-channel health monitoring
   - Automatic failover on health check failure
   - Health check intervals configurable

2. **Circuit Breaker Pattern**
   ```typescript
   class CircuitBreaker {
     private failures: number = 0;
     private lastFailureTime: number = 0;
     private state: 'closed' | 'open' | 'half-open' = 'closed';
     
     async execute<T>(operation: () => Promise<T>): Promise<T> {
       if (this.state === 'open') {
         if (Date.now() - this.lastFailureTime > this.timeout) {
           this.state = 'half-open';
         } else {
           throw new CircuitBreakerOpenError();
         }
       }
       
       try {
         const result = await operation();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
   }
   ```

3. **Retry Logic**
   - Exponential backoff
   - Configurable retry counts
   - Retry per channel

4. **Dead Letter Queue**
   - Failed messages go to DLQ
   - Manual retry capability
   - Error categorization

### 6.3 Observability & Monitoring 🟡 IMPORTANT

#### Requirements:

1. **Per-Channel Metrics**
   ```typescript
   interface ChannelMetrics {
     successRate: number;
     averageLatency: number;
     errorRate: number;
     totalMessages: number;
     failures: number;
     circuitBreakerState: string;
   }
   ```

2. **Distributed Tracing**
   - X-Ray traces per channel
   - End-to-end request tracing
   - Channel-specific annotations

3. **Logging**
   - Structured logging per channel
   - Log levels per channel
   - Channel-specific log contexts

4. **Cost Tracking**
   - Track costs per channel
   - Cost alerts
   - Budget management

### 6.4 Lifecycle Management 🟡 IMPORTANT

#### Requirements:

1. **Initialization**
   - Parallel initialization where possible
   - Lazy initialization for optional channels
   - Initialization timeout handling
   - Initialization failure handling

2. **Cleanup**
   - Graceful shutdown on Lambda termination
   - Connection cleanup
   - Resource release

3. **Connection Pooling**
   - Reuse connections across invocations
   - Connection health monitoring
   - Connection pool configuration

### 6.5 Message Routing & Transformation 🔴 CRITICAL

#### Requirements:

1. **Routing Rules**
   ```typescript
   interface RoutingRule {
     condition: (message: Message, context: Context) => boolean;
     channels: string[];
     priority: number;
     transform?: (message: Message) => Message;
   }
   
   // Example rules
   const rules: RoutingRule[] = [
     {
       condition: (msg) => msg.recipient.includes('@example.com'),
       channels: ['email', 'slack'],
       priority: 1,
     },
     {
       condition: (msg) => msg.urgency === 'high',
       channels: ['whatsapp', 'sms'],
       priority: 1,
       transform: (msg) => ({ ...msg, prefix: '🚨 URGENT: ' }),
     },
   ];
   ```

2. **Message Transformation**
   - Format messages per channel
   - Add channel-specific formatting
   - Handle attachments/media

3. **Batching**
   - Batch messages for cost optimization
   - Configurable batch sizes
   - Batch timeouts

4. **Priority Queuing**
   - Priority-based message ordering
   - VIP recipient handling
   - Rate limiting per priority

### 6.6 Configuration Validation & Safety 🟡 IMPORTANT

#### Requirements:

1. **Startup Validation**
   - Validate all channel configs on startup
   - Fail fast on invalid configuration
   - Clear error messages

2. **Schema Validation**
   ```typescript
   import { z } from 'zod';
   
   const ChannelConfigSchema = z.object({
     type: z.string(),
     enabled: z.boolean(),
     priority: z.number().optional(),
     config: z.record(z.unknown()),
   });
   ```

3. **Safe Defaults**
   - Default values for optional channels
   - Graceful degradation
   - No-config required channels

4. **Configuration Change Detection**
   - Detect config changes
   - Reload channels on config change
   - Version configuration

## 7. Recommendations & Action Plan

### 7.1 Priority Matrix

| Priority | Task | Impact | Effort | Timeline |
|----------|------|--------|--------|----------|
| 🔴 **P0** | Create BaseClient class | High | Low | Week 1 |
| 🔴 **P0** | Refactor GoogleCalendarClient | High | Medium | Week 1 |
| 🔴 **P0** | Refactor GoogleSheetsClient | High | Medium | Week 1 |
| 🔴 **P0** | Refactor AWS clients (S3, SNS, CloudWatch) | High | Low | Week 1 |
| 🟡 **P1** | Implement client registry/factory | Medium | Medium | Week 2 |
| 🟡 **P1** | Standardize error handling | Medium | Low | Week 2 |
| 🟡 **P1** | Extract WhatsApp initialization | Medium | Medium | Week 2 |
| 🟢 **P2** | Channel health checks | Low | Medium | Week 3 |
| 🟢 **P2** | Circuit breaker pattern | Low | High | Week 4 |
| 🟢 **P2** | Configuration validation system | Low | Medium | Week 4 |

### 7.2 Implementation Phases

#### Phase 1: Foundation (Week 1) 🔴 CRITICAL

**Goal:** Create base client class and migrate existing clients

**Tasks:**
1. ✅ Create `BaseClient` abstract class
   - Common initialization patterns
   - Availability checking interface
   - X-Ray tracing wrapper
   - Error handling utilities
   - Lambda runtime detection

2. ✅ Create `ClientError` class
   - Standardized error format
   - Client name in error
   - Metadata support

3. ✅ Migrate `GoogleCalendarClient`
   - Extend `BaseClient`
   - Implement abstract methods
   - Remove duplicated code

4. ✅ Migrate `GoogleSheetsClient`
   - Same pattern as Calendar

5. ✅ Migrate AWS clients
   - `S3ClientWrapper` → `S3Client extends BaseClient`
   - `SNSClientWrapper` → `SNSClient extends BaseClient`
   - `CloudWatchMetricsClient` → `CloudWatchClient extends BaseClient`

6. ✅ Update X-Ray client (if needed)
   - Ensure compatibility with base class

7. ✅ Tests
   - Unit tests for base class
   - Integration tests for migrated clients

**Deliverables:**
- `src/clients/base.client.ts`
- `src/clients/errors/client-error.ts`
- Updated client implementations
- Test suite

#### Phase 2: Standardization (Week 2) 🟡 IMPORTANT

**Goal:** Standardize patterns and improve dependency injection

**Tasks:**
1. ✅ Create client registry/factory
   ```typescript
   class ClientRegistry {
     private clients = new Map<string, BaseClient>();
     
     register(name: string, client: BaseClient): void;
     get<T extends BaseClient>(name: string): T;
     getAll(): BaseClient[];
   }
   ```

2. ✅ Standardize configuration passing
   - Inject config into clients
   - Remove direct config imports from clients

3. ✅ Standardize error handling
   - Use `ClientError` everywhere
   - Consistent error messages
   - Error categorization

4. ✅ Extract WhatsApp initialization complexity
   - Create `WhatsAppAuthService`
   - Simplify client class
   - Better testability

5. ✅ Reduce orchestrator dependencies
   - Use service locator pattern
   - Or dependency injection container

**Deliverables:**
- `src/clients/client-registry.ts`
- Refactored services
- Improved dependency management

#### Phase 3: Multi-Channel Foundation (Week 3-4) 🟢 NICE TO HAVE

**Goal:** Prepare for multi-channel capabilities

**Tasks:**
1. ✅ Channel health check system
   - Health check interface
   - Implement for existing channels
   - Health check registry

2. ✅ Circuit breaker implementation
   - Circuit breaker class
   - Integration with clients
   - Metrics integration

3. ✅ Configuration validation
   - Schema validation (Zod)
   - Startup validation
   - Runtime validation

4. ✅ Metrics per channel
   - Channel metrics collection
   - CloudWatch integration
   - Dashboard creation

**Deliverables:**
- Health check system
- Circuit breaker implementation
- Configuration validation
- Channel metrics

### 7.3 Success Metrics

#### Code Quality:
- ✅ 30-40% reduction in client code
- ✅ 100% consistency in availability checking
- ✅ 100% consistency in error handling
- ✅ Zero X-Ray duplication

#### Maintainability:
- ✅ Adding new client: < 1 hour
- ✅ Testing new client: < 30 minutes
- ✅ Consistent patterns across all clients

#### Multi-Channel Readiness:
- ✅ Support for 3+ input channels
- ✅ Support for 5+ output channels
- ✅ Configuration-driven channel management
- ✅ Health checks for all channels

## 8. Detailed Implementation Plan: BaseClient

### 8.1 File Structure

```
src/clients/
├── base.client.ts              # Base client class
├── errors/
│   └── client-error.ts         # Client error classes
├── google-calendar.client.ts   # (refactored)
├── google-sheets.client.ts     # (refactored)
├── whatsapp.client.ts          # (refactored)
├── s3.client.ts                # (refactored)
├── sns.client.ts               # (refactored)
├── cloudwatch.client.ts        # (refactored)
└── xray.client.ts              # (existing, may need updates)
```

### 8.2 BaseClient Implementation

See section 4.3 for detailed code structure.

### 8.3 Migration Checklist

For each client:

- [ ] Extend `BaseClient`
- [ ] Implement `isAvailable()` method
- [ ] Implement `getClientName()` method
- [ ] Implement `getConfigErrorMessage()` method
- [ ] Override `initialize()` if needed
- [ ] Replace X-Ray wrapping with `captureSegment()`
- [ ] Replace error creation with `createError()`
- [ ] Update constructor to accept `config` and `xrayClient`
- [ ] Update all usages to pass dependencies
- [ ] Add unit tests
- [ ] Update integration tests

### 8.4 Breaking Changes

**⚠️ Potential Breaking Changes:**

1. **Constructor Signatures**
   - Clients will require `config` and `xrayClient` in constructor
   - Migration: Update all instantiations

2. **Error Types**
   - Errors may change to `ClientError`
   - Migration: Update error handling code

3. **Singleton Pattern**
   - May need to change from singleton to factory pattern
   - Migration: Update imports/usage

**Mitigation:**
- Incremental migration (one client at a time)
- Comprehensive tests before migration
- Feature flags for gradual rollout

## 9. Conclusion

The refactoring of clients via a common base class is **critical** for:
1. ✅ Reducing tech debt
2. ✅ Enabling multi-channel architecture
3. ✅ Improving maintainability
4. ✅ Supporting configuration-driven management
5. ✅ Preparing for Lambda multi-channel requirements

**Next Steps:**
1. Review and approve this plan
2. Create GitHub issues for Phase 1 tasks
3. Begin implementation of `BaseClient` class
4. Migrate clients incrementally
5. Document patterns and best practices

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-XX  
**Maintained By:** Architecture Team


