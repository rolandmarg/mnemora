# Sync Logic Refinement - Month/Day Pattern Matching and Fail-Fast Error Handling

**Date:** 2025-11-20  
**Severity:** High  
**Status:** Fixed

## Summary

Refined the duplicate detection logic to match recurring birthday events by month/day pattern instead of exact date (including year), and added fail-fast error handling to prevent duplicate creation when the duplicate check fails.

## Problem

After the initial fix that changed duplicate checking from birth year range to current year range, a subtle issue remained:

1. **Exact date matching failed for recurring events**: The lookup key used the full date including year (e.g., `1990-05-31|john|doe`), but recurring events appear with current year dates (e.g., `2025-05-31`)
2. **Mismatch between creation date and recurring instance date**: 
   - Event created with: `1990-05-31` (birth year)
   - Event appears in calendar as: `2025-05-31` (current year)
   - Lookup key checked: `1990-05-31|john|doe` (from source data)
   - Existing event key: `2025-05-31|john|doe` (from calendar)
   - Result: No match found, duplicate created
3. **Silent failure on duplicate check errors**: If the duplicate check failed (e.g., API error), the code returned an empty array, causing all birthdays to be created again as duplicates

## Impact

- **Duplicate events created**: Even after fixing the date range issue, duplicates were still being created because the lookup key didn't match recurring event instances
- **Massive duplication risk**: If the duplicate check API call failed, the system would create all birthdays again, leading to hundreds of duplicates
- **Data integrity issues**: Multiple birthday events for the same person in the calendar
- **User experience**: Multiple WhatsApp notifications for the same birthday

## Root Cause

### Issue 1: Exact Date Matching vs Recurring Events

The lookup key was constructed using the full date from the source data:
```typescript
// Before (incorrect)
const getLookupKey = (b: BirthdayRecord) => 
  `${formatDateISO(new Date(b.birthday))}|${b.firstName.toLowerCase()}|${(b.lastName ?? '').toLowerCase()}`;
```

This created keys like:
- Source data: `1990-05-31|john|doe`
- Calendar event (recurring instance): `2025-05-31|john|doe`
- Result: No match, duplicate created

### Issue 2: Silent Failure on Error

When the duplicate check failed, the code returned an empty array:
```typescript
// Before (dangerous)
const existingBirthdays = await this.read({ ... }).catch((error) => {
  this.ctx.logger.error('Error reading existing birthdays for duplicate check', error);
  return []; // Returns empty array, causing all birthdays to be created again
});
```

This meant:
- If API call failed → empty array returned
- Empty array → no duplicates found
- No duplicates found → all birthdays created again
- Result: Massive duplication

## Fix

### Fix 1: Month/Day Pattern Matching

Changed the lookup key to use only month and day, ignoring the year:

```typescript
// After (correct)
const getLookupKey = (b: BirthdayRecord) => {
  const month = String(b.birthday.getMonth() + 1).padStart(2, '0');
  const day = String(b.birthday.getDate()).padStart(2, '0');
  return `${month}-${day}|${b.firstName.toLowerCase()}|${(b.lastName ?? '').toLowerCase()}`;
};
```

This creates keys like:
- Source data: `05-31|john|doe`
- Calendar event (recurring instance): `05-31|john|doe`
- Result: Match found, duplicate skipped ✓

### Fix 2: Fail-Fast Error Handling

Changed error handling to throw an error instead of returning an empty array:

```typescript
// After (safe)
const existingBirthdays = await this.read({ 
  startDate: checkStartDate, 
  endDate: checkEndDate 
}).catch((error) => {
  this.ctx.logger.error('CRITICAL: Failed to read existing birthdays for duplicate check', error, {
    errorType: 'duplicate_check_failed',
    impact: 'Cannot safely sync - would create duplicates',
  });
  // Throw error instead of returning empty array to prevent duplicate creation
  throw new Error(`Failed to check for duplicate birthdays: ${error instanceof Error ? error.message : String(error)}. Cannot safely sync without duplicate check.`);
});
```

This ensures:
- If duplicate check fails → error thrown
- Error thrown → sync operation fails
- Sync fails → no birthdays created
- Result: No duplicates, safe failure mode ✓

### Additional Improvements

1. **Enhanced logging**: Added `matchType: 'month/day pattern'` to log messages for clarity
2. **Better comments**: Added detailed comments explaining why month/day matching is necessary
3. **Improved error context**: Added structured error logging with `errorType` and `impact` fields

## Files Changed

- `src/data-source/implementations/calendar.source.ts`:
  - Changed `getLookupKey()` to use month/day pattern instead of exact date
  - Changed error handling in `write()` method to throw instead of returning empty array
  - Enhanced logging with match type information
  - Added detailed comments explaining the matching logic

## Testing

1. **Month/Day Pattern Matching**:
   - Verify that birthdays with same month/day but different years are correctly identified as duplicates
   - Verify that recurring event instances are matched correctly
   - Test with birthdays from various years (1990, 2000, 2010, etc.)

2. **Fail-Fast Error Handling**:
   - Simulate API failure during duplicate check
   - Verify that sync operation fails with clear error message
   - Verify that no birthdays are created when duplicate check fails

3. **Integration Testing**:
   - Run full sync operation with existing birthdays
   - Verify no duplicates are created
   - Verify existing events are properly detected and skipped

## Prevention

1. **Always match recurring events by pattern, not exact date**: Recurring events appear with current dates, not original creation dates
2. **Fail fast on critical checks**: If a duplicate check fails, don't proceed with creation - fail the operation instead
3. **Test with recurring events**: Always test duplicate detection with recurring calendar events, not just one-time events
4. **Consider event lifecycle**: Understand how recurring events work in the calendar system (they appear with current year dates)
5. **Add defensive checks**: When a critical operation (like duplicate check) fails, fail the entire operation rather than proceeding with incomplete information

## Related Issues

- [Sync Logic Bug - Duplicate Check Using Wrong Date Range](./2025-11-20-sync-logic-bug.md) - Initial fix that changed from birth year to current year range
- [Lambda Duplicates and Date Range Bug](./2025-11-20-lambda-duplicates-and-date-range-bug.md) - Related duplicate detection issues

## Lessons Learned

1. **Recurring events have different dates**: Recurring calendar events appear with current year dates, not the original creation date. Always match by pattern (month/day) for recurring events.

2. **Silent failures are dangerous**: Returning an empty array on error might seem safe, but it can cause massive data duplication. Fail fast instead.

3. **Test edge cases**: Test with events from different years to ensure pattern matching works correctly.

4. **Logging is critical**: Adding `matchType` to logs helps debug duplicate detection issues and understand what matching strategy is being used.

