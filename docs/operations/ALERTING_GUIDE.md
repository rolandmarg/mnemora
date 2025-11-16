# Alerting Guide

Complete guide to all alert types, severity levels, and remediation steps for Mnemora Birthday Bot.

## Table of Contents

1. [Alert Severity Levels](#alert-severity-levels)
2. [Alert Delivery](#alert-delivery)
3. [Alert Types](#alert-types)
4. [Alert Deduplication](#alert-deduplication)
5. [Daily Summaries](#daily-summaries)
6. [Configuration](#configuration)

---

## Alert Severity Levels

### CRITICAL
- **Delivery**: Email + SMS (immediate)
- **When**: System failures that prevent core functionality
- **Examples**: Lambda execution failures, daily execution missed, monthly digest not sent on 1st

### WARNING
- **Delivery**: Email (immediate), SMS (optional)
- **When**: Issues that affect functionality but don't completely break the system
- **Examples**: WhatsApp message send failures, authentication required, API quota warnings

### INFO
- **Delivery**: Email only (included in daily summary)
- **When**: Informational alerts that don't require immediate action
- **Examples**: Auth refresh needed, high execution duration, API quota approaching limits

---

## Alert Delivery

### Email
- All alerts are sent to the configured email address via SNS
- Subject line format: `[SEVERITY] Mnemora Birthday Bot: {alert_type}`
- Includes correlation ID, timestamp, error details, CloudWatch Logs link, and remediation steps

### SMS
- CRITICAL alerts only
- Sent to configured phone number via SNS
- Includes alert title and brief message

### Daily Summary
- Sent daily at 10 PM (if there are active alerts)
- Groups alerts by severity
- Includes alert counts and first occurrence timestamps
- Only sent if there are unresolved alerts

---

## Alert Types

### CRITICAL Alerts

#### 1. `lambda-execution-failed`
- **Trigger**: Lambda function throws an unhandled exception
- **Severity**: CRITICAL
- **Delivery**: Email + SMS
- **Remediation Steps**:
  1. Check CloudWatch Logs for error details
  2. Verify correlation ID for tracing
  3. Check Lambda function configuration
  4. Verify IAM permissions
  5. Check environment variables

#### 2. `lambda-timeout`
- **Trigger**: Lambda execution exceeds 15-minute timeout
- **Severity**: CRITICAL
- **Delivery**: Email + SMS
- **Remediation Steps**:
  1. Check CloudWatch Logs to see where execution timed out
  2. Consider increasing Lambda timeout if needed
  3. Optimize slow operations (API calls, WhatsApp initialization)
  4. Check for infinite loops or blocking operations

#### 3. `daily-execution-missed`
- **Trigger**: No execution detected in the last 25 hours
- **Severity**: CRITICAL
- **Delivery**: Email + SMS
- **Remediation Steps**:
  1. Check EventBridge rule is enabled
  2. Verify Lambda function is not disabled
  3. Check for Lambda errors in CloudWatch Logs
  4. Verify IAM permissions for EventBridge to invoke Lambda
  5. Manually trigger Lambda function to test

#### 4. `monthly-digest-failed`
- **Trigger**: Monthly digest not sent on the 1st of the month
- **Severity**: CRITICAL
- **Delivery**: Email + SMS
- **Remediation Steps**:
  1. Check WhatsApp authentication status
  2. Verify WhatsApp group ID is correct
  3. Check CloudWatch Logs for send errors
  4. Manually send monthly digest if needed
  5. Verify WhatsApp session is valid

#### 5. `google-calendar-api-failed`
- **Trigger**: Google Calendar API completely unavailable (auth/permission errors)
- **Severity**: CRITICAL
- **Delivery**: Email + SMS
- **Remediation Steps**:
  1. Verify Google service account credentials are valid
  2. Check calendar ID is correct
  3. Verify service account has calendar access
  4. Check Google Calendar API quota
  5. Verify network connectivity

---

### WARNING Alerts

#### 6. `whatsapp-message-failed`
- **Trigger**: WhatsApp message send fails after 3 retry attempts
- **Severity**: WARNING
- **Delivery**: Email (SMS optional)
- **Remediation Steps**:
  1. Check WhatsApp connection status
  2. Verify group ID/name is correct
  3. Check for rate limiting
  4. Re-authenticate WhatsApp if needed
  5. Verify bot account is still in the group

#### 7. `whatsapp-auth-required`
- **Trigger**: WhatsApp session expired or missing, QR code needed
- **Severity**: WARNING
- **Delivery**: Email (SMS optional)
- **Remediation Steps**:
  1. Open CloudWatch Logs for the Lambda function
  2. Find log entry with "QR_CODE_FOR_SCANNING"
  3. Copy the qrCode value
  4. Generate QR code image using the URL in logs
  5. Scan QR code with WhatsApp mobile app
  6. Session will be saved automatically

#### 8. `whatsapp-group-not-found`
- **Trigger**: WhatsApp group name doesn't match any group
- **Severity**: WARNING
- **Delivery**: Email (SMS optional)
- **Remediation Steps**:
  1. Verify group name matches exactly (case-sensitive)
  2. Ensure bot's WhatsApp account is in the group
  3. Check group name in WhatsApp settings
  4. Verify WHATSAPP_GROUP_ID environment variable

#### 9. `whatsapp-client-init-failed`
- **Trigger**: WhatsApp client initialization fails (browser launch, protocol errors)
- **Severity**: WARNING
- **Delivery**: Email (SMS optional)
- **Remediation Steps**:
  1. Check Lambda memory and timeout settings
  2. Verify S3 session storage is accessible
  3. Check for browser/Puppeteer errors in logs
  4. Try re-authenticating WhatsApp
  5. Check if session files are corrupted

#### 10. `missed-days-recovery-failed`
- **Trigger**: Failed to recover and send monthly digest for latest missed 1st-of-month date
- **Severity**: WARNING
- **Delivery**: Email (SMS optional)
- **Note**: Only the latest missed monthly digest is recovered (not all missed ones), and individual birthday messages are NOT recovered
- **Remediation Steps**:
  1. Check CloudWatch Logs for specific error and missed date
  2. Manually trigger monthly digest send for the missed 1st-of-month date if needed
  3. Fix underlying issue (API, WhatsApp, etc.)

#### 11. `s3-storage-failed`
- **Trigger**: S3 read/write operations fail
- **Severity**: WARNING
- **Delivery**: Email (SMS optional)
- **Remediation Steps**:
  1. Check IAM permissions for S3 access
  2. Verify S3 bucket exists and is in correct region
  3. Check bucket policy allows Lambda access
  4. Verify AWS_REGION environment variable

#### 12. `cloudwatch-metrics-failed`
- **Trigger**: Failed to send metrics to CloudWatch
- **Severity**: WARNING
- **Delivery**: Email (SMS optional)
- **Remediation Steps**:
  1. Check IAM permissions for CloudWatch Metrics
  2. Verify region configuration
  3. Check CloudWatch service status

---

### INFO Alerts

#### 13. `whatsapp-auth-refresh-needed`
- **Trigger**: 7+ days since last WhatsApp authentication
- **Severity**: INFO
- **Delivery**: Email only (daily summary)
- **Remediation Steps**:
  1. Proactively re-authenticate before session expires
  2. Check CloudWatch Logs for QR code when needed
  3. Session typically expires after 7 days

#### 14. `high-execution-duration`
- **Trigger**: Execution takes >10 minutes
- **Severity**: INFO
- **Delivery**: Email only (daily summary)
- **Remediation Steps**:
  1. Check CloudWatch Logs for slow operations
  2. Optimize API calls (batch requests)
  3. Check for network timeouts
  4. Consider increasing Lambda timeout if needed

#### 15. `api-quota-warning`
- **Trigger**: Approaching Google Calendar API quota limits (>80%)
- **Severity**: INFO
- **Delivery**: Email only (daily summary)
- **Remediation Steps**:
  1. Optimize API calls (batch requests, reduce frequency)
  2. Request quota increase from Google if needed
  3. Monitor API usage in Google Cloud Console

---

## Alert Deduplication

### How It Works
- Same alert type within 1 hour = increment count, don't send duplicate
- Alert resolves when condition clears (e.g., execution succeeds after failure)
- Daily summary includes all active alerts regardless of recent sends

### Alert State
- Stored in S3: `alerts/active-alerts.json`
- Tracks: first occurrence, last occurrence, count, resolved status
- Updated on every alert send/resolve

### Resolution
Alerts are automatically resolved when:
- Execution succeeds after failure
- WhatsApp auth completes
- Monthly digest sent successfully
- API access restored

---

## Daily Summaries

### When Sent
- Daily at 10 PM (after main execution window)
- Only if there are active (unresolved) alerts

### Content
- Groups alerts by severity (CRITICAL, WARNING, INFO)
- Shows alert counts and first occurrence timestamps
- Includes CloudWatch Logs link
- Provides system health status

### Format
```
Mnemora Birthday Bot - Daily Alert Summary
Generated: 2024-01-15T22:00:00Z

CRITICAL Alerts (2):
  - lambda-execution-failed: Occurred 3 time(s), first at 2024-01-15T09:00:00Z
  - daily-execution-missed: Occurred 1 time(s), first at 2024-01-15T10:00:00Z

WARNING Alerts (1):
  - whatsapp-message-failed: Occurred 2 time(s), first at 2024-01-15T09:15:00Z

View CloudWatch Logs for detailed information.
Resolve alerts by fixing underlying issues - they will be marked as resolved automatically.
```

---

## Configuration

### Environment Variables
- `SNS_TOPIC_ARN`: ARN of the SNS topic for alerts (required in Lambda)
- `ALERT_EMAIL`: Email address for receiving alerts (set in SAM template)
- `ALERT_PHONE`: Phone number for SMS alerts (optional, set in SAM template)

### SNS Topic Setup
1. SNS topic is created automatically by SAM template
2. Email subscription requires confirmation (check email inbox)
3. SMS subscription requires phone number verification
4. Topic ARN is passed to Lambda via environment variable

### CloudWatch Alarms
- Alarms are defined in `infrastructure/cloudwatch-alarms.yaml`
- All alarms are connected to the SNS topic
- Alarms trigger based on CloudWatch metrics
- Alarms send notifications to SNS topic

---

## Alert Flow

### Immediate Alerts
1. Error occurs in application
2. Alert service determines severity
3. Alert is sent via SNS (email + SMS for CRITICAL)
4. Alert state is updated in S3
5. Deduplication prevents spam (1-hour window)

### Daily Summaries
1. Daily summary Lambda runs at 10 PM
2. Checks for active (unresolved) alerts
3. Groups alerts by severity
4. Generates summary message
5. Sends via SNS (email only)

### Alert Resolution
1. Condition clears (e.g., execution succeeds)
2. Alert is marked as resolved in S3
3. Resolution timestamp is recorded
4. Alert is included in next daily summary (if any)
5. Alert is removed from active alerts after resolution

---

## Troubleshooting

### No Alerts Received
1. Check SNS topic subscriptions are confirmed
2. Verify email address is correct
3. Check spam/junk folder
4. Verify SNS_TOPIC_ARN environment variable
5. Check CloudWatch Logs for alert send errors

### Too Many Alerts
1. Check alert deduplication is working (1-hour window)
2. Verify alerts are resolving when conditions clear
3. Check for recurring issues that need fixing
4. Review daily summary instead of individual alerts

### Missing Alerts
1. Check alert state in S3: `alerts/active-alerts.json`
2. Verify alerting service is initialized
3. Check CloudWatch Logs for alert send errors
4. Verify SNS permissions in IAM

---

## Best Practices

1. **Monitor Daily Summaries**: Check daily summaries for system health
2. **Resolve Root Causes**: Fix underlying issues to prevent recurring alerts
3. **Use Correlation IDs**: Trace issues using correlation IDs in logs
4. **Check CloudWatch Logs**: Always check logs for detailed error information
5. **Test Alerting**: Manually trigger alerts to verify delivery

---

## Alert Examples

### CRITICAL Alert Example
```
Subject: [CRITICAL] Mnemora Birthday Bot: Lambda Execution Failed

[CRITICAL] Lambda Execution Failed

Time: 2024-01-15T09:00:00Z
Correlation ID: abc123-def456-ghi789

The Lambda function execution failed with an exception. Check CloudWatch Logs for details.

Error: TypeError: Cannot read property 'read' of undefined

Stack Trace:
  at BirthdayService.getTodaysBirthdays (birthday.ts:56:23)
  ...

Remediation Steps:
  1. Check CloudWatch Logs for error details
  2. Verify correlation ID for tracing
  3. Check Lambda function configuration
  4. Verify IAM permissions
  5. Check environment variables

CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/...
```

### WARNING Alert Example
```
Subject: [WARNING] Mnemora Birthday Bot: WhatsApp Message Send Failed

[WARNING] WhatsApp Message Send Failed

Time: 2024-01-15T09:15:00Z
Correlation ID: xyz789-abc123-def456

Failed to send WhatsApp message after retry attempts.

Error: Protocol error: Target closed

Additional Details:
  groupId: test bot
  retries: 3

Remediation Steps:
  1. Check WhatsApp connection status
  2. Verify group ID/name is correct
  3. Check for rate limiting
  4. Re-authenticate WhatsApp if needed
  5. Verify bot account is still in the group

CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/...
```

---

This guide should be updated whenever new alert types are added to the system.

