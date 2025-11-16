# Monitoring and Alerting Guide

Complete guide to monitoring Mnemora Birthday Bot in AWS.

## Overview

The bot emits metrics and logs to CloudWatch for monitoring and alerting. Key metrics track:
- Daily execution status
- Monthly digest delivery
- WhatsApp message success/failure
- Authentication status
- Error rates

## Metrics

### Execution Metrics

- **`execution.started`** (Count) - Execution started
- **`execution.completed`** (Count) - Execution completed successfully
- **`execution.failed`** (Count) - Execution failed
- **`execution.duration`** (Milliseconds) - Total execution time

### Business Metrics

- **`birthdays.fetched`** (Count) - Number of birthdays fetched
- **`birthdays.sent`** (Count) - Number of birthday messages sent
- **`monthly_digest.sent`** (Count) - Monthly digest sent (should be 1 on 1st of month)
- **`missed_days.detected`** (Count) - Missed execution days detected

### WhatsApp Metrics

- **`whatsapp.messages.sent`** (Count) - Messages sent successfully
- **`whatsapp.messages.failed`** (Count) - Messages failed to send
- **`whatsapp.auth.required`** (Count) - Authentication required (QR code shown)
- **`whatsapp.session.refreshed`** (Count) - Session refreshed
- **`whatsapp.auth.refresh_needed`** (Count) - Authentication refresh needed (7+ days)

### API Metrics

- **`api.calendar.calls`** (Count) - Google Calendar API calls
- **`api.sheets.calls`** (Count) - Google Sheets API calls

### Monitoring Metrics

- **`monitoring.daily_execution`** (Count) - Daily execution recorded (1 = success, 0 = failure)
- **`monitoring.monthly_digest_sent`** (Count) - Monthly digest sent status
- **`monitoring.health.daily_execution`** (Count) - Health check: daily execution
- **`monitoring.health.monthly_digest`** (Count) - Health check: monthly digest

### Operation Duration Metrics

- **`operation.{operation}.duration`** (Milliseconds) - Duration of specific operations
  - `operation.getTodaysBirthdays.duration`
  - `operation.getTodaysBirthdaysWithMonthlyDigest.duration`
  - `operation.whatsapp.send.duration`

## CloudWatch Alarms

### Daily Execution Missed

**Alarm**: `{FunctionName}-DailyExecutionMissed`

**Trigger**: No execution in 25 hours

**Metric**: `monitoring.daily_execution` (Sum, 1 hour period)

**Action**: SNS notification

**Resolution**: Check Lambda function logs, verify EventBridge rule is enabled

### Monthly Digest Not Sent

**Alarm**: `{FunctionName}-MonthlyDigestNotSent`

**Trigger**: No monthly digest sent on 1st of month

**Metric**: `monitoring.monthly_digest_sent` (Sum, 1 day period)

**Action**: SNS notification

**Resolution**: Check if it's the 1st, verify WhatsApp authentication, check logs

### High Error Rate

**Alarm**: `{FunctionName}-HighErrorRate`

**Trigger**: 2+ failed executions in 2 hours

**Metric**: `execution.failed` (Sum, 1 hour period, 2 evaluations)

**Action**: SNS notification

**Resolution**: Check CloudWatch Logs for errors, verify credentials

### WhatsApp Authentication Failures

**Alarm**: `{FunctionName}-WhatsAppAuthFailure`

**Trigger**: 3+ auth requests in 1 hour

**Metric**: `whatsapp.auth.required` (Sum, 1 hour period)

**Action**: SNS notification

**Resolution**: Check if session expired, re-authenticate via CloudWatch Logs QR code

### WhatsApp Message Failures

**Alarm**: `{FunctionName}-WhatsAppMessageFailure`

**Trigger**: 3+ message failures in 1 hour

**Metric**: `whatsapp.messages.failed` (Sum, 1 hour period)

**Action**: SNS notification

**Resolution**: Check WhatsApp connection, verify group ID, check authentication

## CloudWatch Dashboard

Create a dashboard with the following widgets:

### Widget 1: Execution Status
- **Metric**: `execution.completed` (Sum, 1 day)
- **Metric**: `execution.failed` (Sum, 1 day)
- **Type**: Number

### Widget 2: Daily Execution Trend
- **Metric**: `monitoring.daily_execution` (Sum, 1 hour)
- **Type**: Line chart
- **Period**: 7 days

### Widget 3: Birthday Messages Sent
- **Metric**: `birthdays.sent` (Sum, 1 day)
- **Type**: Number
- **Period**: 30 days

### Widget 4: Monthly Digest Status
- **Metric**: `monthly_digest.sent` (Sum, 1 day)
- **Type**: Number
- **Period**: 30 days

### Widget 5: WhatsApp Message Success Rate
- **Metric**: `whatsapp.messages.sent` (Sum, 1 day)
- **Metric**: `whatsapp.messages.failed` (Sum, 1 day)
- **Type**: Line chart
- **Period**: 7 days

### Widget 6: Execution Duration
- **Metric**: `execution.duration` (Average, 1 hour)
- **Type**: Line chart
- **Period**: 7 days

### Widget 7: Error Rate
- **Metric**: `execution.failed` (Sum, 1 hour)
- **Type**: Line chart
- **Period**: 7 days

## Setting Up Alarms

### Using CloudFormation

Deploy the alarms stack:

```bash
aws cloudformation create-stack \
  --stack-name mnemora-alarms \
  --template-body file://infrastructure/cloudwatch-alarms.yaml \
  --parameters \
    ParameterKey=FunctionName,ParameterValue=mnemora-birthday-bot-prod \
    ParameterKey=LogGroupName,ParameterValue=/aws/lambda/mnemora-birthday-bot-prod \
    ParameterKey=SnsTopicArn,ParameterValue=arn:aws:sns:region:account:topic-name
```

### Using AWS Console

1. Go to CloudWatch → Alarms
2. Create alarm for each metric
3. Set thresholds as specified above
4. Configure SNS topic for notifications

## SNS Topic Setup

1. **Create SNS Topic**:
   ```bash
   aws sns create-topic --name mnemora-birthday-bot-alerts
   ```

2. **Subscribe Email**:
   ```bash
   aws sns subscribe \
     --topic-arn arn:aws:sns:region:account:mnemora-birthday-bot-alerts \
     --protocol email \
     --notification-endpoint your-email@example.com
   ```

3. **Confirm subscription** (check email)

4. **Subscribe Slack** (optional):
   - Use AWS Chatbot integration
   - Or use SNS → Lambda → Slack webhook

## Log Analysis

### Key Log Patterns

Search CloudWatch Logs for:

- **`QR_CODE_FOR_SCANNING`** - QR code for authentication
- **`execution.started`** - Execution started
- **`execution.completed`** - Execution completed
- **`Error`** - Errors and failures
- **`correlationId`** - Trace specific execution

### Log Insights Queries

**Daily execution count**:
```
fields @timestamp, @message
| filter @message like /execution.completed/
| stats count() by bin(1d)
```

**Error rate**:
```
fields @timestamp, @message
| filter @message like /Error/
| stats count() by bin(1h)
```

**WhatsApp authentication events**:
```
fields @timestamp, @message
| filter @message like /QR_CODE_FOR_SCANNING/ or @message like /whatsapp.auth/
| stats count() by bin(1d)
```

## Health Checks

### Manual Health Check

Use the monitoring service:

```typescript
import { monitoring } from './utils/monitoring.js';

const health = await monitoring.getHealthStatus();
console.log(health);
// {
//   healthy: true,
//   dailyExecution: true,
//   monthlyDigest: true,
//   timestamp: '2024-01-15T10:00:00.000Z'
// }
```

### Automated Health Check

Create a separate Lambda function that runs every hour to check health:

```typescript
import { monitoring } from './utils/monitoring.js';

export async function handler() {
  const health = await monitoring.getHealthStatus();
  await monitoring.emitHealthMetrics();
  
  if (!health.healthy) {
    // Trigger alert
  }
  
  return { statusCode: 200, body: JSON.stringify(health) };
}
```

## Troubleshooting Alerts

### Daily Execution Missed

1. Check EventBridge rule is enabled
2. Check Lambda function logs for errors
3. Verify IAM permissions
4. Check if function was deleted/disabled

### Monthly Digest Not Sent

1. Verify it's the 1st of the month
2. Check if monthly digest was generated (logs)
3. Check WhatsApp authentication status
4. Verify WhatsApp group ID is correct

### High Error Rate

1. Check CloudWatch Logs for error details
2. Verify Google Calendar API credentials
3. Check network connectivity
4. Review X-Ray traces for slow operations

### WhatsApp Authentication Issues

1. Check S3 bucket for session files
2. Review CloudWatch Logs for QR code
3. Verify IAM permissions for S3
4. Check if session expired (7+ days)

## Best Practices

1. **Set up alerts early** - Don't wait for issues
2. **Review metrics weekly** - Check trends and patterns
3. **Test alerts** - Verify notifications work
4. **Document runbooks** - Create procedures for common issues
5. **Set up dashboards** - Visualize metrics for quick status checks
6. **Use correlation IDs** - Trace issues across logs
7. **Review X-Ray traces** - Identify performance bottlenecks

## Cost Optimization

- **Log retention**: Set to 30 days (default)
- **Metrics**: Use CloudWatch Embedded Metrics Format
- **X-Ray sampling**: Use sampling rules to reduce costs
- **Alarm evaluation**: Use appropriate evaluation periods

