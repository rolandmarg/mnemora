# Error Analysis: Lambda Initialization Failure (2025-11-19)

## Summary

The daily summary Lambda function (`mnemora-daily-summary-prod`) failed with `Runtime.Unknown` errors during initialization, preventing the bot from running.

## Error Details

**Error Type**: `Runtime.Unknown`  
**Phase**: `INIT` (module initialization)  
**Request ID**: `bfd64dff-0b61-457b-a16e-e5f82f4d6d27`  
**Function**: `mnemora-daily-summary-prod`  
**Memory**: 256 MB  
**Duration**: ~2.8 seconds (init phase)

### Error Message

```
Error: Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env
```

### Stack Trace

```
Error: Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env
    at new GoogleCalendarClient (file:///var/task/clients/google-calendar.client.js:35:19)
    at file:///var/task/clients/google-calendar.client.js:119:24
    at ModuleJob.run (node:internal/modules/esm/module_job:325:25)
    at async ModuleLoader.import (node:internal/modules/esm/loader:606:24)
    at async _tryAwaitImport (file:///var/runtime/index.mjs:1098:16)
    at async _tryRequire (file:///var/runtime/index.mjs:1156:37)
    at async _loadUserApp (file:///var/runtime/index.mjs:1186:16)
    at async UserFunction.js.module.exports.load (file:///var/runtime/index.mjs:1235:21)
    at async start (file:///var/runtime/index.mjs:1454:23)
    at async file:///var/runtime/index.mjs:1464:1
```

## Root Cause Analysis

### The Problem

1. **Eager Initialization**: The `GoogleCalendarClient` was instantiated at module load time (line 149 of `google-calendar.client.ts`):
   ```typescript
   const calendarClient = new GoogleCalendarClient();
   export default calendarClient;
   ```

2. **Constructor Validation**: The constructor immediately validates credentials:
   ```typescript
   constructor() {
     const clientEmail = config.google.clientEmail;
     const privateKey = config.google.privateKey;
     
     if (!clientEmail || !privateKey) {
       throw new Error('Google Calendar credentials not configured...');
     }
     // ... rest of initialization
   }
   ```

3. **Import Chain**: The daily summary handler imports `appContext`, which imports the calendar client:
   - `daily-summary-handler.ts` → imports `appContext`
   - `app-context.ts` → imports `calendarClient`
   - `google-calendar.client.ts` → creates instance at module load
   - Constructor throws error → `Runtime.Unknown`

4. **Handler Never Executes**: Because the error occurs during INIT phase (before handler runs):
   - No try/catch can catch it
   - No custom metrics are emitted
   - No SNS alerts are sent
   - Only CloudWatch Logs shows the error

### Why This Happened

The daily summary handler doesn't actually need the Google Calendar client - it only needs to send alerts via SNS. However, because `appContext` eagerly imports all clients, the calendar client was initialized even though it wasn't used.

## Impact

- **Daily summary function failed** - No daily summary alerts were sent
- **No alerting** - Because the handler never ran, no SNS alerts were sent about the failure
- **Silent failure** - Only visible in CloudWatch Logs, not caught by existing alarms

## Fixes Applied

### 1. Added CloudWatch Alarm for Initialization Errors

Added alarms to `infrastructure/cloudwatch-alarms.yaml`:
- `LambdaInitErrorAlarm` - Monitors main function for `Runtime.Unknown` errors
- `DailySummaryInitErrorAlarm` - Monitors daily summary function for `Runtime.Unknown` errors

These alarms use the AWS Lambda `Errors` metric which includes initialization failures.

**Alarm Configuration**:
- **Metric**: `AWS/Lambda` namespace, `Errors` metric
- **Period**: 5 minutes
- **Threshold**: 1 error
- **Action**: SNS notification

### 2. Made Calendar Client Lazy-Loaded

Modified `src/clients/google-calendar.client.ts`:
- Changed from eager initialization to lazy initialization
- Client only initializes when first accessed (via getter methods)
- Allows handlers that don't need calendar to load without errors

**Before**:
```typescript
class GoogleCalendarClient {
  private readonly readOnlyCalendar: CalendarClient;
  // ... initialized in constructor
}

const calendarClient = new GoogleCalendarClient(); // ❌ Eager
```

**After**:
```typescript
class GoogleCalendarClient {
  private _readOnlyCalendar: CalendarClient | null = null;
  private _initialized = false;
  
  private initialize(): void {
    if (this._initialized) return;
    // ... initialization logic
  }
  
  private get readOnlyCalendar(): CalendarClient {
    this.initialize(); // ✅ Lazy
    return this._readOnlyCalendar!;
  }
}

const calendarClient = new GoogleCalendarClient(); // ✅ Safe - no init yet
```

### 3. Made Sheets Client Lazy-Loaded

Applied the same lazy-loading pattern to `src/clients/google-sheets.client.ts` to prevent similar issues.

## Prevention

### Immediate Actions

1. **Deploy the alarm** - The new alarms will catch future initialization errors
2. **Deploy the code fix** - Lazy-loading prevents the error from occurring

### Long-term Improvements

1. **Monitor initialization errors** - The new alarms will alert on `Runtime.Unknown` errors
2. **Consider dependency injection** - For better separation of concerns
3. **Add integration tests** - Test that handlers can load without all dependencies

## Playbook Links

When this error occurs, check:

1. **CloudWatch Logs**: 
   - https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fmnemora-daily-summary-prod

2. **Lambda Monitoring**:
   - https://us-west-1.console.aws.amazon.com/lambda/home?region=us-west-1#/functions/mnemora-daily-summary-prod/monitoring

3. **CloudWatch Alarms** (after deployment):
   - https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#alarmsV2:?alarmNameFilter=InitError

4. **Log Insights Query**:
   ```
   fields @timestamp, @message
   | filter @message like /Runtime.Unknown/ or @message like /INIT_REPORT/
   | sort @timestamp desc
   ```

## Related Files

- `src/clients/google-calendar.client.ts` - Fixed with lazy initialization
- `src/clients/google-sheets.client.ts` - Fixed with lazy initialization  
- `src/app-context.ts` - Imports clients (now safe with lazy loading)
- `src/lambda/daily-summary-handler.ts` - Handler that was failing
- `infrastructure/cloudwatch-alarms.yaml` - Added initialization error alarms

## Next Steps

1. ✅ Add CloudWatch alarms for initialization errors
2. ✅ Fix lazy-loading for calendar and sheets clients
3. ⏳ Deploy infrastructure changes (alarms)
4. ⏳ Deploy code changes (lazy-loading)
5. ⏳ Verify the fix works by checking logs after deployment

---

**Date**: 2025-11-19  
**Resolved**: Yes (code fix + alarms added)  
**Status**: Ready for deployment

