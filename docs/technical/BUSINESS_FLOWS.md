# Business Flows and Execution Logic

Complete documentation of all execution flows, decision trees, and error scenarios for Mnemora Birthday Bot.

## Table of Contents

1. [Normal Execution Flow](#normal-execution-flow)
2. [Missed Days Recovery Flow](#missed-days-recovery-flow)
3. [Monthly Digest Flow](#monthly-digest-flow)
4. [WhatsApp Authentication Flow](#whatsapp-authentication-flow)
5. [Error Scenarios and Recovery](#error-scenarios-and-recovery)
6. [Alert Triggers](#alert-triggers)

---

## Normal Execution Flow

### Trigger
- **Scheduled**: EventBridge rule triggers Lambda daily at 9:00 AM Los Angeles time
- **Manual**: Lambda function invoked manually via AWS Console or CLI

### Flow Steps

1. **Lambda Handler Entry** (`src/lambda/handler.ts`)
   - Initialize correlation ID from request ID
   - Log execution start
   - Track execution start metric
   - Call `runBirthdayCheck()`

2. **Check for Missed Days** (`src/index-core.ts::checkAndSendMissedDays()`)
   - Read last run date from S3 (or local file)
   - Calculate missed dates since last run
   - If missed dates exist:
     - Take only the most recent missed date (to avoid spamming)
     - Fetch birthdays for that date from Google Calendar
     - Send birthday messages via WhatsApp (if birthdays exist)
     - Log missed days recovery
   - If no missed dates: Continue to main flow

3. **Fetch Today's Birthdays** (`src/services/birthday.ts::getTodaysBirthdaysWithOptionalDigest()`)
   - Check if today is first day of month
   - If first of month:
     - Fetch entire month's birthdays (optimized single API call)
     - Filter for today's birthdays
     - Generate monthly digest message
   - If not first of month:
     - Fetch only today's birthdays
   - Track API calls and operation duration

4. **Send Monthly Digest** (if first of month)
   - Format monthly digest: `🎂 Date: Name 🎉, Name 🎭`
   - Initialize WhatsApp channel
   - Send digest to WhatsApp group
   - Track monthly digest sent metric
   - If send fails: Log warning (non-critical)

5. **Send Today's Birthday Messages** (if birthdays exist)
   - Format personal messages: `🎂 🎉 Name` (one per person)
   - For each birthday:
     - Send individual message to WhatsApp group
     - Wait 1 second between messages (rate limiting)
     - Track success/failure
   - If no birthdays: Log "No birthdays today"

6. **Update Last Run Date**
   - Write current date to S3 (or local file)
   - Record execution in monitoring system
   - Track successful execution metric

7. **Cleanup**
   - Flush CloudWatch metrics
   - Destroy WhatsApp client (preserves session)
   - Return success response

### Success Criteria
- Lambda returns 200 status code
- Last run date updated in S3
- Monitoring record shows `executed: true`
- CloudWatch metric `execution.completed` = 1

---

## Missed Days Recovery Flow

### Trigger
- Detected during normal execution flow
- Calculated by comparing last run date to today

### Flow Steps

1. **Detection** (`src/utils/last-run-tracker.ts::getMissedDates()`)
   - Read last run date from S3
   - Calculate all dates between last run and today (exclusive)
   - Return array of missed dates

2. **Recovery Decision**
   - If missed dates exist:
     - Take only the **most recent** missed date (last in array)
     - This prevents spamming multiple days of messages
   - If no missed dates: Skip recovery

3. **Fetch Missed Day Birthdays**
   - Query Google Calendar for birthdays on missed date
   - If birthdays found:
     - Format personal birthday messages
     - Send each message via WhatsApp
     - Track birthday sent metrics
   - If no birthdays: Log and continue

4. **Error Handling**
   - If WhatsApp unavailable: Log and skip (non-critical)
   - If calendar API fails: Log error (recovery fails silently)
   - Recovery failures don't block main execution

### Success Criteria
- Most recent missed day's birthdays sent (if any)
- Main execution continues normally
- Missed days metric tracked

---

## Monthly Digest Flow

### Trigger
- Automatically detected on first day of month
- Part of normal execution flow

### Flow Steps

1. **Date Check** (`src/utils/date-helpers.ts::isFirstDayOfMonth()`)
   - Check if today is the 1st of the month
   - If yes: Generate monthly digest
   - If no: Skip digest generation

2. **Fetch Month's Birthdays**
   - Fetch all birthdays for current month (single API call)
   - Group by date
   - Sort dates chronologically

3. **Format Monthly Digest**
   - For each date with birthdays:
     - Format: `🎂 Nov 8: Martin 🎭, Sarah 🎉`
     - Birthday cake emoji always first
     - Random emoji at end of each name
     - Dates padded for alignment
   - Join with newlines

4. **Send Digest**
   - Initialize WhatsApp channel
   - Send formatted digest to group
   - Track `monthly_digest.sent` metric
   - Record in monitoring: `monthlyDigestSent: true`

5. **Error Handling**
   - If WhatsApp unavailable: Log warning
   - If send fails: Log error (non-critical for main flow)
   - On 1st of month: Send CRITICAL alert if digest fails

### Success Criteria
- Monthly digest sent successfully
- Metric `monitoring.monthly_digest_sent` = 1
- Monitoring record shows `monthlyDigestSent: true`

---

## WhatsApp Authentication Flow

### Trigger
- First time execution (no session exists)
- Session expired (7+ days since last auth)
- Session file corrupted or missing

### Flow Steps

1. **Check Session** (`src/output-channel/implementations/whatsapp.channel.ts::initializeClient()`)
   - Check if session exists in S3 (Lambda) or local filesystem
   - If session exists: Try to use saved session
   - If no session: Require authentication

2. **Initialize Client**
   - Create WhatsApp Web.js client with LocalAuth
   - Configure Puppeteer (headless mode)
   - Set up event handlers

3. **QR Code Display**
   - Client emits `qr` event with QR code string
   - In Lambda: Log QR code to CloudWatch Logs (structured JSON)
   - In Local: Display QR code in terminal using `qrcode-terminal`
   - Track `whatsapp.auth.required` metric
   - Send WARNING alert: WhatsApp authentication required

4. **User Action Required**
   - User must scan QR code with WhatsApp mobile app
   - Steps:
     1. Open WhatsApp on phone
     2. Go to Settings → Linked Devices
     3. Tap "Link a Device"
     4. Scan QR code from CloudWatch Logs (Lambda) or terminal (local)

5. **Authentication**
   - Client emits `authenticated` event when QR scanned
   - Client emits `ready` event when fully connected
   - Session automatically saved to S3 (Lambda) or local filesystem
   - Record authentication timestamp in S3
   - Track `whatsapp.session.refreshed` metric

6. **Session Persistence**
   - Session stored in S3: `.wwebjs_auth/` directory
   - Next execution uses saved session (no QR code needed)
   - Session valid for ~7 days (WhatsApp Web limitation)

### Success Criteria
- Client state is `CONNECTED` or `OPENING`
- Session file exists in S3
- Authentication timestamp recorded
- No QR code required on subsequent runs

### Failure Scenarios
- **Initialization timeout** (3 minutes): Send WARNING alert
- **Authentication failure**: Send WARNING alert, log error
- **Session save failure**: Log warning (session may not persist)

---

## Error Scenarios and Recovery

### Scenario 1: Lambda Execution Failure

**Trigger**: Exception thrown in `runBirthdayCheck()`

**Flow**:
1. Error caught in Lambda handler
2. Log error with correlation ID
3. Record failed execution: `monitoring.recordDailyExecution(false, false)`
4. Track `execution.failed` metric
5. Send CRITICAL alert: `lambda-execution-failed`
6. Return 500 status code

**Alert**: CRITICAL (email + SMS)
**Recovery**: Manual intervention required - check CloudWatch Logs

---

### Scenario 2: Lambda Timeout

**Trigger**: Execution exceeds 15-minute timeout

**Flow**:
1. Lambda runtime terminates execution
2. CloudWatch alarm triggers (if configured)
3. No execution record written (timeout before completion)
4. Next execution detects missed day
5. Send CRITICAL alert: `lambda-timeout`

**Alert**: CRITICAL (email + SMS)
**Recovery**: 
- Check CloudWatch Logs for where it timed out
- Increase Lambda timeout if needed
- Optimize slow operations

---

### Scenario 3: Google Calendar API Failure

**Sub-scenarios**:

#### 3a. Authentication Failure
- **Error**: Invalid credentials, expired token
- **Alert**: CRITICAL
- **Recovery**: Update Google service account credentials

#### 3b. Network Timeout
- **Error**: Request timeout, connection refused
- **Alert**: WARNING (if transient), CRITICAL (if persistent)
- **Recovery**: Retry logic, check network connectivity

#### 3c. API Quota Exceeded
- **Error**: 429 Too Many Requests
- **Alert**: WARNING
- **Recovery**: Wait for quota reset, optimize API calls

#### 3d. Calendar Not Found
- **Error**: 404 Calendar not found
- **Alert**: CRITICAL
- **Recovery**: Verify calendar ID in configuration

#### 3e. Permission Denied
- **Error**: 403 Forbidden
- **Alert**: CRITICAL
- **Recovery**: Grant service account calendar access

**Flow**:
1. API call fails in `birthdayService.getTodaysBirthdays()`
2. Error logged with details
3. Track `api.calendar.calls` with `success: false`
4. Alert sent based on error type
5. Exception propagated (fails execution)

---

### Scenario 4: WhatsApp Client Initialization Failure

**Trigger**: Client fails to initialize (browser launch, protocol errors)

**Flow**:
1. `initializeClient()` fails or times out
2. Error logged
3. Send WARNING alert: `whatsapp-client-init-failed`
4. Return error from `send()` method
5. Execution continues (WhatsApp failures are non-critical)

**Alert**: WARNING (email, SMS optional)
**Recovery**: 
- Check S3 session files
- Re-authenticate if needed
- Check Lambda memory/timeout settings

---

### Scenario 5: WhatsApp Authentication Required

**Trigger**: Session expired or missing

**Flow**:
1. Client requires QR code
2. QR code logged to CloudWatch Logs
3. Track `whatsapp.auth.required` metric
4. Send WARNING alert: `whatsapp-auth-required`
5. Execution waits for QR scan (up to 3 minutes)
6. If timeout: Execution fails for this run

**Alert**: WARNING (email, SMS optional)
**Recovery**: 
- Check CloudWatch Logs for QR code
- Scan QR code with WhatsApp
- Next execution will use saved session

---

### Scenario 6: WhatsApp Message Send Failure

**Trigger**: Message send fails after 3 retry attempts

**Flow**:
1. `whatsappChannel.send()` attempts send
2. Retry logic: 3 attempts with 3-second delays
3. If all retries fail:
   - Log error
   - Track `whatsapp.messages.failed` metric
   - Send WARNING alert: `whatsapp-message-failed`
   - Return error (but don't fail execution)

**Alert**: WARNING (email, SMS optional)
**Special Case**: If monthly digest fails on 1st of month → CRITICAL alert

**Recovery**:
- Check WhatsApp connection
- Verify group ID/name
- Check for rate limiting
- Re-authenticate if needed

---

### Scenario 7: WhatsApp Group Not Found

**Trigger**: Group name doesn't match any group in WhatsApp

**Flow**:
1. `findGroupByName()` searches all chats
2. No matching group found
3. Return error from `send()`
4. Send WARNING alert: `whatsapp-group-not-found`
5. Log group name that was searched

**Alert**: WARNING (email, SMS optional)
**Recovery**: 
- Verify group name matches exactly (case-sensitive)
- Ensure bot's WhatsApp account is in the group
- Check group name in WhatsApp

---

### Scenario 8: S3 Storage Failure

**Trigger**: Cannot read/write to S3 bucket

**Sub-scenarios**:
- Access denied (IAM permissions)
- Bucket not found
- Network timeout
- Write failures

**Flow**:
1. S3 operation fails in storage utility
2. Error logged
3. Send WARNING alert: `s3-storage-failed`
4. Fallback to local filesystem (if local)
5. Execution continues (storage is non-critical)

**Alert**: WARNING (email, SMS optional)
**Recovery**: 
- Check IAM permissions
- Verify bucket exists
- Check bucket region matches Lambda region

---

### Scenario 9: CloudWatch Metrics Flush Failure

**Trigger**: Cannot send metrics to CloudWatch

**Flow**:
1. `metrics.flush()` fails
2. Error logged (non-critical)
3. Send WARNING alert: `cloudwatch-metrics-failed`
4. Execution completes normally (metrics are non-critical)

**Alert**: WARNING (email, SMS optional)
**Recovery**: 
- Check IAM permissions for CloudWatch
- Verify region configuration
- Check CloudWatch service status

---

### Scenario 10: Missed Days Recovery Failed

**Trigger**: Recovery attempt fails (API error, WhatsApp unavailable)

**Flow**:
1. `checkAndSendMissedDays()` encounters error
2. Error logged
3. Send WARNING alert: `missed-days-recovery-failed`
4. Main execution continues (recovery is best-effort)

**Alert**: WARNING (email, SMS optional)
**Recovery**: 
- Check CloudWatch Logs for specific error
- Manually trigger recovery if needed
- Fix underlying issue (API, WhatsApp, etc.)

---

### Scenario 11: Monthly Digest Not Sent on 1st

**Trigger**: It's the 1st of month but monthly digest send failed

**Flow**:
1. Monthly digest generation succeeds
2. WhatsApp send fails
3. Check date: If 1st of month
4. Send CRITICAL alert: `monthly-digest-failed`
5. Record in monitoring: `monthlyDigestSent: false`

**Alert**: CRITICAL (email + SMS)
**Recovery**: 
- Check WhatsApp authentication
- Verify group ID
- Manually send monthly digest if needed

---

### Scenario 12: Daily Execution Missed

**Trigger**: No execution in 25+ hours (detected by CloudWatch alarm or monitoring check)

**Flow**:
1. CloudWatch alarm checks `monitoring.daily_execution` metric
2. No metric in last 25 hours
3. Alarm triggers
4. Send CRITICAL alert: `daily-execution-missed`
5. Next execution will attempt recovery

**Alert**: CRITICAL (email + SMS)
**Recovery**: 
- Check EventBridge rule is enabled
- Check Lambda function status
- Verify IAM permissions
- Check for Lambda errors in CloudWatch Logs

---

### Scenario 13: WhatsApp Auth Refresh Needed

**Trigger**: 7+ days since last authentication

**Flow**:
1. `authReminder.checkAndEmitReminder()` checks last auth date
2. If 7+ days: Send INFO alert: `whatsapp-auth-refresh-needed`
3. Log reminder
4. Track `whatsapp.auth.refresh_needed` metric
5. Execution continues (not blocking)

**Alert**: INFO (email only, included in daily summary)
**Recovery**: 
- Proactively re-authenticate before session expires
- Check CloudWatch Logs for QR code when needed

---

### Scenario 14: High Execution Duration

**Trigger**: Execution takes >10 minutes

**Flow**:
1. Track execution duration in metrics
2. If duration >10 minutes:
   - Send INFO alert: `high-execution-duration`
   - Log performance warning
3. Execution completes normally

**Alert**: INFO (email only, included in daily summary)
**Recovery**: 
- Optimize slow operations
- Check for API timeouts
- Consider increasing Lambda timeout

---

### Scenario 15: API Quota Warning

**Trigger**: Approaching Google Calendar API quota limits

**Flow**:
1. Track API call counts
2. If approaching quota (e.g., >80% of daily limit):
   - Send INFO alert: `api-quota-warning`
   - Log quota status
3. Execution continues

**Alert**: INFO (email only, included in daily summary)
**Recovery**: 
- Optimize API calls (batch requests)
- Request quota increase if needed
- Monitor API usage

---

## Alert Triggers Summary

### CRITICAL Alerts (Email + SMS, Immediate)
1. `lambda-execution-failed` - Lambda throws exception
2. `lambda-timeout` - Execution exceeds 15 minutes
3. `daily-execution-missed` - No execution in 25+ hours
4. `monthly-digest-failed` - Monthly digest not sent on 1st
5. `google-calendar-api-failed` - Calendar API completely unavailable (auth/permission errors)

### WARNING Alerts (Email + SMS Optional, Immediate)
1. `whatsapp-message-failed` - Message send fails after retries
2. `whatsapp-auth-required` - QR code needed for authentication
3. `whatsapp-group-not-found` - Group name doesn't match
4. `whatsapp-client-init-failed` - Client initialization fails
5. `missed-days-recovery-failed` - Recovery attempt fails
6. `s3-storage-failed` - S3 read/write failures
7. `cloudwatch-metrics-failed` - Metrics flush fails

### INFO Alerts (Email Only, Daily Summary)
1. `whatsapp-auth-refresh-needed` - 7+ days since last auth
2. `high-execution-duration` - Execution >10 minutes
3. `api-quota-warning` - Approaching API quota limits

---

## Decision Trees

### Execution Flow Decision Tree

```
Start
  ↓
Check Missed Days?
  ├─ Yes → Recover Most Recent Missed Day
  │         ├─ Success → Continue
  │         └─ Failure → Log, Continue (non-critical)
  └─ No → Continue
  ↓
Is First of Month?
  ├─ Yes → Fetch Month's Birthdays
  │         ├─ Generate Monthly Digest
  │         ├─ Send Digest via WhatsApp
  │         │   ├─ Success → Track Metric
  │         │   └─ Failure → CRITICAL Alert (if 1st)
  │         └─ Filter Today's Birthdays
  └─ No → Fetch Today's Birthdays Only
  ↓
Any Birthdays Today?
  ├─ Yes → Format Personal Messages
  │         ├─ For Each Birthday:
  │         │   ├─ Send via WhatsApp
  │         │   │   ├─ Success → Track Metric
  │         │   │   └─ Failure → WARNING Alert
  │         │   └─ Wait 1 second
  │         └─ Continue
  └─ No → Log "No birthdays today"
  ↓
Update Last Run Date
  ↓
Record Execution (Success)
  ↓
Flush Metrics
  ↓
Cleanup WhatsApp Client
  ↓
End (Success)
```

### WhatsApp Send Decision Tree

```
Send Message
  ↓
Check Auth Refresh Needed?
  ├─ Yes → Log Reminder (INFO alert)
  └─ No → Continue
  ↓
Initialize Client
  ├─ Success → Continue
  └─ Failure → WARNING Alert, Return Error
  ↓
Client Ready?
  ├─ Yes → Continue
  └─ No → WARNING Alert, Return Error
  ↓
Verify Client State
  ├─ CONNECTED/OPENING → Continue
  └─ Other → Reinitialize
  ↓
Find Group by Name/ID
  ├─ Found → Continue
  └─ Not Found → WARNING Alert, Return Error
  ↓
Send Message (with Retries)
  ├─ Success → Track Metric, Return Success
  └─ Failure (after 3 retries) → WARNING Alert, Return Error
```

### Error Handling Decision Tree

```
Error Occurs
  ↓
What Type of Error?
  ├─ Lambda Exception → CRITICAL Alert, Fail Execution
  ├─ Lambda Timeout → CRITICAL Alert, Fail Execution
  ├─ Calendar API Auth/Permission → CRITICAL Alert, Fail Execution
  ├─ Calendar API Quota/Timeout → WARNING Alert, Fail Execution
  ├─ WhatsApp Init Failure → WARNING Alert, Continue (non-critical)
  ├─ WhatsApp Auth Required → WARNING Alert, Fail This Run
  ├─ WhatsApp Send Failure → WARNING Alert, Continue (non-critical)
  │                         └─ If Monthly Digest on 1st → CRITICAL Alert
  ├─ WhatsApp Group Not Found → WARNING Alert, Continue (non-critical)
  ├─ S3 Storage Failure → WARNING Alert, Continue (non-critical)
  ├─ CloudWatch Metrics Failure → WARNING Alert, Continue (non-critical)
  └─ Other → Log, Continue (non-critical)
  ↓
Record Error in Metrics
  ↓
Send Alert (if applicable)
  ↓
Continue or Fail Execution (based on error type)
```

---

## State Transitions

### Execution State Machine

```
[Not Executed] 
  → (Scheduled/Manual Trigger) 
  → [Executing]
    → (Success) 
    → [Executed Successfully]
    → (Next Day) 
    → [Not Executed]
    
[Executing]
  → (Error) 
  → [Execution Failed]
    → (Next Execution) 
    → [Executing] (with recovery)
    
[Execution Failed]
  → (Manual Fix) 
  → [Executed Successfully]
```

### Alert State Machine

```
[No Alert]
  → (Condition Detected) 
  → [Alert Active]
    → (Immediate Send) 
    → [Alert Sent]
      → (Condition Persists) 
      → [Alert Active] (increment count, no duplicate send)
      → (Daily Summary) 
      → [Alert in Summary]
    → (Condition Clears) 
    → [Alert Resolved]
      → (Next Day) 
      → [No Alert]
```

---

## Success and Failure Paths

### Complete Success Path
1. Lambda triggered
2. Missed days checked (none or recovered)
3. Birthdays fetched successfully
4. Monthly digest sent (if applicable)
5. Today's birthday messages sent
6. Last run date updated
7. Metrics flushed
8. Lambda returns 200

### Partial Success Path (Non-Critical Failures)
1. Lambda triggered
2. Missed days checked (recovery failed, but logged)
3. Birthdays fetched successfully
4. Monthly digest generation succeeds
5. WhatsApp send fails (WARNING alert sent)
6. Last run date updated
7. Metrics flushed
8. Lambda returns 200 (execution "succeeded" despite WhatsApp failure)

### Complete Failure Path
1. Lambda triggered
2. Exception thrown (e.g., Calendar API auth failure)
3. Error caught in handler
4. CRITICAL alert sent
5. Failed execution recorded
6. Lambda returns 500

---

## Monitoring and Health Checks

### Daily Health Check (via Monitoring Service)
- Check if execution happened today
- Check if monthly digest sent (if 1st of month)
- Emit health metrics
- Generate health status report

### Alert State Tracking
- Active alerts stored in S3: `alerts/active-alerts.json`
- Track: first occurrence, last occurrence, count, resolved status
- Used for daily summary generation
- Alert resolution when conditions clear

---

## Edge Cases

### Edge Case 1: Multiple Missed Days
- **Behavior**: Only recover most recent missed day
- **Rationale**: Avoid spamming group with multiple days of messages
- **Alert**: None (expected behavior)

### Edge Case 2: No Birthdays on Missed Day
- **Behavior**: Log and continue (no messages sent)
- **Rationale**: Nothing to send
- **Alert**: None

### Edge Case 3: Monthly Digest on Day with Birthdays
- **Behavior**: Send both monthly digest AND today's birthday messages
- **Rationale**: Both are relevant on 1st of month
- **Alert**: None (normal behavior)

### Edge Case 4: WhatsApp Unavailable During Recovery
- **Behavior**: Skip recovery, continue main execution
- **Rationale**: Recovery is best-effort, main execution is priority
- **Alert**: WARNING if recovery was needed

### Edge Case 5: Execution Runs Twice Same Day
- **Behavior**: Second execution sees today as "last run", no missed days
- **Rationale**: Last run date is today, so no recovery needed
- **Alert**: None (normal behavior)

---

## Performance Considerations

### Execution Duration Targets
- Normal execution: <2 minutes
- With monthly digest: <3 minutes
- With missed days recovery: <4 minutes
- Maximum timeout: 15 minutes (Lambda limit)

### API Call Optimization
- Monthly digest: Single API call for entire month (not 30 separate calls)
- Birthday fetch: Single API call per date range
- WhatsApp: Sequential sends with 1-second delays

### Resource Usage
- Lambda memory: 512 MB (sufficient for WhatsApp Web.js)
- Lambda timeout: 900 seconds (15 minutes)
- S3 storage: Minimal (session files, execution records)

---

## Recovery Procedures

### Manual Recovery Steps

1. **Execution Failed**
   - Check CloudWatch Logs for error details
   - Verify correlation ID for tracing
   - Fix underlying issue
   - Manually trigger Lambda if needed

2. **WhatsApp Auth Required**
   - Check CloudWatch Logs for QR code
   - Generate QR code image from log
   - Scan with WhatsApp mobile app
   - Verify session saved in S3

3. **Monthly Digest Missed**
   - Check if it's still 1st of month
   - Manually trigger Lambda
   - Or use manual-send script locally

4. **API Quota Exceeded**
   - Wait for quota reset (daily)
   - Optimize API calls
   - Request quota increase from Google

5. **Group Not Found**
   - Verify exact group name (case-sensitive)
   - Ensure bot's WhatsApp account is in group
   - Check group name in WhatsApp settings

---

This document should be updated whenever new flows or error scenarios are added to the system.

