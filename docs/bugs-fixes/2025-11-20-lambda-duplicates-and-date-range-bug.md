# Bug Fixes: Lambda Duplicates and Date Range Bug

**Date:** 2025-11-20  
**Severity:** High  
**Status:** Fixed

## Summary

Fixed critical bugs that caused:
1. Lambda function running multiple times concurrently, creating duplicate birthday events
2. `fetchEvents` method incorrectly filtering date ranges, causing deduplication script to fail

## Bugs Fixed

### 1. Lambda Concurrent Execution (High Priority)

**Problem:**
- Lambda function could run multiple times concurrently when manually invoked
- Both executions would read existing birthdays at the same time (before either wrote)
- Both would see 0 existing birthdays and create all events, resulting in duplicates
- No reserved concurrency limit, allowing unlimited concurrent executions

**Impact:**
- Duplicate birthday events created in Google Calendar
- Multiple WhatsApp messages sent for the same person
- Race conditions in duplicate detection

**Root Cause:**
- Missing `ReservedConcurrentExecutions` setting in Lambda configuration
- Duplicate detection had race condition - both invocations read before either wrote

**Fix:**
- Added `ReservedConcurrentExecutions: 1` to Lambda function in `infrastructure/template.yaml`
- Added double-check for duplicates right before inserting events in `calendar.source.ts`
- Added deduplication when reading today's birthdays to prevent duplicate messages
- Improved logging to distinguish manual vs EventBridge invocations

**Files Changed:**
- `infrastructure/template.yaml` - Added reserved concurrency
- `src/data-source/implementations/calendar.source.ts` - Added race condition protection and deduplication
- `src/lambda/handler.ts` - Improved logging for invocation source

**Testing:**
- Verified Lambda can only run one instance at a time
- Verified duplicate detection works with concurrent reads
- Verified deduplication prevents duplicate messages

---

### 2. Date Range Filtering Bug in fetchEvents (High Priority)

**Problem:**
- `fetchEvents` method in `google-calendar.client.ts` filtered all-day events to only match the start date
- When querying a date range (e.g., 2023-2027), it would only return events matching the first day
- This caused the deduplication script to find 0 events even though hundreds existed

**Impact:**
- Deduplication script couldn't find any events
- Any code using `fetchEvents` with multi-day/year ranges would miss events
- Calendar data source couldn't properly read events across date ranges

**Root Cause:**
- Filter logic compared event date to only the start date: `eventDate === startDate`
- Should have checked if event date is within the range: `startDate <= eventDate <= endDate`

**Fix:**
- Updated filter to check if event date is within the full date range (inclusive)
- Changed from exact match to range check: `eventDate >= startDateStr && eventDate <= endDateStr`

**Files Changed:**
- `src/clients/google-calendar.client.ts` - Fixed date range filtering logic

**Testing:**
- Verified deduplication script now finds all events correctly
- Verified date range queries work for multi-day/year ranges

---

## Related Issues

- Duplicate birthday events created during Lambda concurrent execution
- Deduplication script unable to find events due to date range bug

## Prevention

1. **Reserved Concurrency:** Always set `ReservedConcurrentExecutions: 1` for critical Lambda functions
2. **Race Condition Protection:** Always double-check for duplicates right before inserting
3. **Date Range Logic:** Always use inclusive range checks (`>=` and `<=`) not exact matches
4. **Testing:** Test with concurrent invocations and wide date ranges

## Scripts Added

- `src/scripts/deduplicate-birthdays.ts` - Script to identify and remove duplicate birthday events
  - Dry-run mode by default
  - Requires `--confirm` flag to actually delete
  - Fetches events directly from Google Calendar API to avoid date range bug

## Deployment Notes

- Lambda configuration change requires redeployment
- No data migration needed
- Existing duplicate events can be cleaned up using `yarn deduplicate-birthdays --confirm`

