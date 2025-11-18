# TODO / Roadmap

Future improvements and enhancements for Mnemora Birthday Bot.

## High Priority

### 1. Enhanced Logging and Message Persistence
**Status**: Not Started  
**Priority**: High  
**Estimated Effort**: Medium

**Current State**:
- Logs are sent to CloudWatch Logs
- Messages are logged but not fully persisted
- No audit trail for sent messages

**Proposed Changes**:
- **Full Message Logging**: Log complete message content (not just metadata)
- **Message Persistence**: Store all sent messages in S3 with metadata:
  - Message content
  - Timestamp
  - Recipient (group ID/name)
  - Message type (birthday, monthly digest)
  - Success/failure status
  - Error details (if failed)
- **Message History API**: Query past messages by date, type, recipient
- **Audit Trail**: Track all message operations for compliance/debugging

**Implementation**:
- Create `src/utils/message-logger.ts` for message persistence
- Store messages in S3: `messages/YYYY-MM-DD/message-{timestamp}.json`
- Add message logging to `whatsapp.channel.ts` after send
- Include full message content in CloudWatch Logs (structured JSON)
- Add retention policy (e.g., 90 days for message history)

**Benefits**:
- Full audit trail of all communications
- Easy debugging of message issues
- Historical analysis of message patterns
- Compliance with data retention requirements

---

### 2. Event-Driven Architecture Migration
**Status**: Not Started  
**Priority**: Medium  
**Estimated Effort**: High

**Current State**:
- Monolithic Lambda function handles all operations
- Synchronous execution flow
- Tight coupling between components

**Proposed Architecture**:
- **Event Bus**: Use EventBridge for internal events
- **Event Types**:
  - `birthday.check.started`
  - `birthday.check.completed`
  - `birthday.found`
  - `message.send.requested`
  - `message.send.completed`
  - `message.send.failed`
  - `monthly.digest.generated`
  - `whatsapp.auth.required`
  - `error.occurred`
- **Event Handlers**: Separate Lambda functions for different concerns:
  - `birthday-checker`: Main birthday check logic
  - `message-sender`: WhatsApp message sending
  - `message-logger`: Message persistence (event-driven)
  - `alert-handler`: Alert generation (event-driven)
  - `analytics-processor`: Metrics and analytics (event-driven)

**Implementation Phases**:
1. **Phase 1**: Add EventBridge events alongside current flow (non-breaking)
2. **Phase 2**: Create separate Lambda functions for message sending
3. **Phase 3**: Migrate message logging to event-driven
4. **Phase 4**: Migrate alerting to event-driven
5. **Phase 5**: Full event-driven architecture

**Benefits**:
- Better scalability (independent scaling of components)
- Loose coupling between components
- Easier to add new features (subscribe to events)
- Better observability (event flow visualization)
- Easier testing (mock events)

**Event Schema Example**:
```typescript
interface BirthdayCheckStartedEvent {
  type: 'birthday.check.started';
  correlationId: string;
  timestamp: string;
  source: 'scheduled' | 'manual';
}

interface MessageSendRequestedEvent {
  type: 'message.send.requested';
  correlationId: string;
  messageType: 'birthday' | 'monthly-digest';
  recipient: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface MessageSendCompletedEvent {
  type: 'message.send.completed';
  correlationId: string;
  messageId: string;
  recipient: string;
  duration: number;
  success: boolean;
  error?: string;
}
```

---

### 3. Prevent Duplicate Daily Sends
**Status**: Not Started  
**Priority**: High  
**Estimated Effort**: Medium

**Issue**: No protection against race conditions - multiple Lambda invocations can send duplicate messages on the same day.

**Solution**: Implement distributed lock using DynamoDB conditional PutItem for Lambda, S3 conditional write for local scripts.

---

## Medium Priority

### 4. Message Templates and Localization
**Status**: Not Started  
**Priority**: Medium  
**Estimated Effort**: Medium

**Proposed Changes**:
- Template system for messages (Mustache/Handlebars)
- Support for multiple languages
- Customizable message formats per group
- A/B testing for message effectiveness

**Implementation**:
- Create `src/templates/` directory
- Template files: `birthday.template`, `monthly-digest.template`
- Localization files: `en.json`, `es.json`, etc.
- Template engine integration

---

### 5. Advanced Analytics and Reporting
**Status**: Not Started  
**Priority**: Medium  
**Estimated Effort**: Medium

**Proposed Changes**:
- Dashboard for message statistics
- Success/failure rates over time
- Group engagement metrics
- Birthday distribution analysis
- Cost tracking and optimization

**Implementation**:
- CloudWatch Dashboard enhancements
- Custom metrics for analytics
- S3-based analytics data warehouse
- Optional: QuickSight integration

---

### 6. Multi-Group Support
**Status**: Not Started  
**Priority**: Medium  
**Estimated Effort**: Medium

**Proposed Changes**:
- Support multiple WhatsApp groups
- Different message formats per group
- Group-specific configurations
- Per-group analytics

**Implementation**:
- Configuration: `WHATSAPP_GROUP_IDS` (comma-separated)
- Group-specific templates
- Per-group message logging
- Group routing logic

---

### 7. Retry and Backoff Strategy Improvements
**Status**: Not Started  
**Priority**: Medium  
**Estimated Effort**: Low

**Proposed Changes**:
- Exponential backoff for retries
- Dead letter queue for failed messages
- Retry scheduling (e.g., retry failed messages after 1 hour)
- Retry analytics

**Implementation**:
- SQS dead letter queue
- EventBridge scheduled retries
- Retry state tracking in S3

---

### 8. Automatic Calendar Event Deletion with Human Confirmation
**Status**: Not Started  
**Priority**: Medium  
**Estimated Effort**: Medium

**Current State**:
- Sheets-to-Calendar sync only adds/updates birthdays
- Deleted names in spreadsheet remain in Google Calendar
- No automatic cleanup of removed birthdays

**Proposed Changes**:
- **Detect Deletions**: Compare current spreadsheet data with existing calendar events
- **Identify Orphaned Events**: Find calendar events that no longer exist in spreadsheet
- **Human Confirmation Safeguard**: Before deleting, require human verification (similar to terminal QR code flow)
  - Display list of events to be deleted
  - Show event details (name, date, event ID)
  - Require explicit confirmation before proceeding
  - Support both interactive terminal prompt and Lambda-friendly confirmation mechanism
- **Safe Deletion**: Only delete events after confirmation
- **Audit Trail**: Log all deletion operations with confirmation details

**Implementation Considerations**:
- Add deletion detection logic to `trySyncFromSheets()` or new `syncWithDeletion()` method
- Create confirmation interface similar to WhatsApp QR code terminal display
- For Lambda: Could use SNS email with confirmation link, or store pending deletions in S3 and require manual script execution
- For local scripts: Interactive terminal confirmation prompt
- Store pending deletions with metadata (detected date, event details)
- Add configuration flag: `ENABLE_AUTO_DELETE` (default: false for safety)

**Safety Features**:
- Never auto-delete without explicit confirmation
- Show full event details before confirmation
- Support dry-run mode to preview what would be deleted
- Reversible operation (could restore from backup if needed)
- Rate limiting on deletions (e.g., max N deletions per sync)

**Benefits**:
- Keep calendar in sync with spreadsheet automatically
- Prevent orphaned birthday events
- Human oversight prevents accidental deletions
- Maintains data integrity

---

## Low Priority / Future Considerations

### 9. AWS Deployment Playbooks
**Status**: Not Started  
**Priority**: Low  
**Estimated Effort**: Medium

**Proposed Changes**:
- Automated deployment playbooks for AWS infrastructure
- Infrastructure as Code (IaC) improvements
- Multi-environment deployment strategies
- Automated rollback procedures
- Blue-green deployment support

**Implementation**:
- Create deployment playbooks/scripts
- Enhance SAM template with more configuration options
- Add deployment validation steps
- Create staging environment setup
- Document deployment procedures

---

### 10. WhatsApp Cloud API Migration
**Status**: Documented (see [MIGRATION_GUIDE.md](./operations/MIGRATION_GUIDE.md))  
**Priority**: Low (when WhatsApp Web.js becomes unsupported)  
**Estimated Effort**: High

**Notes**:
- Migration guide already exists
- Requires WhatsApp Business API account
- Better reliability and scalability
- Official API support

---

### 11. CI/CD Pipeline
**Status**: Not Started  
**Priority**: Low  
**Estimated Effort**: Medium

**Proposed Changes**:
- GitHub Actions for automated testing
- Automated deployment to AWS
- Environment promotion (dev → staging → prod)
- Automated rollback on failures

---

### 12. Unit and Integration Tests
**Status**: Not Started  
**Priority**: Low  
**Estimated Effort**: High

**Proposed Changes**:
- Unit tests for all services
- Integration tests for Lambda functions
- Mock WhatsApp client for testing
- Test coverage reporting

**Implementation**:
- Jest test framework
- Mock AWS services (LocalStack)
- Test fixtures and helpers

---

### 13. Configuration Management
**Status**: Not Started  
**Priority**: Low  
**Estimated Effort**: Low

**Proposed Changes**:
- AWS Systems Manager Parameter Store for config
- Secrets Manager for sensitive values
- Environment-specific configurations
- Configuration versioning

---

### 14. Performance Optimization
**Status**: Not Started  
**Priority**: Low  
**Estimated Effort**: Medium

**Proposed Changes**:
- Lambda cold start optimization
- Connection pooling for WhatsApp client
- Batch API calls where possible
- Caching for frequently accessed data

---

### 15. Monitoring Dashboard Enhancements
**Status**: Partially Complete (see [MONITORING.md](./operations/MONITORING.md))  
**Priority**: Low  
**Estimated Effort**: Low

**Proposed Changes**:
- Real-time alert status
- Message success rate trends
- Group activity visualization
- Cost tracking dashboard

---

## Technical Debt

### 16. Type Safety Improvements
**Status**: Ongoing  
**Priority**: Low  
**Estimated Effort**: Low

**Notes**:
- Continue improving TypeScript types
- Remove any remaining `any` types
- Add runtime type validation where needed

---

### 17. Error Handling Standardization
**Status**: Ongoing  
**Priority**: Low  
**Estimated Effort**: Low

**Notes**:
- Standardize error types across services
- Consistent error formatting
- Better error context propagation

---

### 18. Documentation Updates
**Status**: Ongoing  
**Priority**: Low  
**Estimated Effort**: Low

**Notes**:
- Keep documentation up to date
- Add code examples
- Improve troubleshooting guides

---

## Research / Exploration

### 19. Alternative Message Channels
**Status**: Research  
**Priority**: Very Low  
**Estimated Effort**: Unknown

**Ideas**:
- Telegram bot integration
- Slack integration
- Email fallback
- SMS via Twilio (for critical alerts)

---

### 20. Machine Learning Enhancements
**Status**: Research  
**Priority**: Very Low  
**Estimated Effort**: High

**Ideas**:
- Predict best time to send messages
- Personalize message content
- Detect anomalies in birthday patterns
- Optimize message delivery times

---

## Notes

- **Priority Levels**:
  - **High**: Core functionality improvements, critical for production
  - **Medium**: Important enhancements, improve user experience
  - **Low**: Nice-to-have features, technical debt
  - **Research**: Exploration, not committed

- **Estimated Effort**:
  - **Low**: < 1 week
  - **Medium**: 1-2 weeks
  - **High**: 2+ weeks

- **Status**:
  - **Not Started**: Not yet begun
  - **In Progress**: Currently being worked on
  - **Completed**: Finished
  - **Blocked**: Waiting on dependencies
  - **Research**: Exploring feasibility

---

## Quick Reference: Event Architecture Migration

### Current Architecture
```
EventBridge (Schedule) → Lambda (BirthdayBotFunction)
                          ├─ Birthday Service
                          ├─ WhatsApp Channel
                          ├─ Monitoring
                          └─ Alerting
```

### Target Event-Driven Architecture
```
EventBridge (Schedule) → Lambda (BirthdayChecker)
                          └─ Publishes: birthday.check.started
                             
EventBridge → Lambda (MessageSender)
                └─ Publishes: message.send.completed
                   
EventBridge → Lambda (MessageLogger)
                └─ Persists to S3
                   
EventBridge → Lambda (AlertHandler)
                └─ Publishes alerts to SNS
                   
EventBridge → Lambda (AnalyticsProcessor)
                └─ Updates metrics
```

### Migration Strategy
1. **Add events alongside current flow** (non-breaking)
2. **Create new Lambda functions** for event handlers
3. **Gradually migrate** functionality to event-driven
4. **Remove old code** once migration complete
5. **Monitor** event flow and performance

---

## Quick Reference: Enhanced Logging

### Current Logging
```typescript
logger.info('Message sent', {
  messageId: result.messageId,
  recipient: chatId,
  // Message content not logged
});
```

### Enhanced Logging
```typescript
// Full message logging
logger.info('Message sent', {
  messageId: result.messageId,
  recipient: chatId,
  messageContent: message, // Full content
  messageType: 'birthday',
  metadata: { ... },
});

// Persist to S3
await messageLogger.persist({
  messageId: result.messageId,
  content: message,
  recipient: chatId,
  timestamp: new Date().toISOString(),
  success: true,
});
```

### Message Storage Structure
```
s3://bucket/messages/
  ├─ 2024-01-15/
  │   ├─ message-20240115T090000.123Z.json
  │   ├─ message-20240115T090015.456Z.json
  │   └─ ...
  ├─ 2024-01-16/
  │   └─ ...
```

### Message JSON Schema
```json
{
  "messageId": "abc123",
  "timestamp": "2024-01-15T09:00:00.123Z",
  "messageType": "birthday",
  "recipient": "test bot",
  "content": "🎂 🎉 John Doe",
  "success": true,
  "duration": 1234,
  "metadata": {
    "correlationId": "xyz789",
    "attempt": 1
  }
}
```

---

This TODO list should be reviewed and updated regularly as priorities change.

