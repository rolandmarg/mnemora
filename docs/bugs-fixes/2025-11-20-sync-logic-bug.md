# Sync Logic Bug - Duplicate Check Using Wrong Date Range

**Date:** 2025-11-20  
**Severity:** High  
**Status:** Fixed

## Summary

The sync logic was checking for duplicate birthday events in the birth year range (e.g., 1990) instead of the current year range where recurring events actually appear. This caused duplicate events to be created even when they already existed in the calendar.

## Problem

When syncing birthdays from Sheets to Calendar:

1. **Birth year range used for duplicate check**: The `write()` method used `getDateRangeForBirthdays()` which returns the birth year range (e.g., 1990-01-01 to 1990-12-31)
2. **Recurring events appear in current year**: Birthday events are recurring and appear in the current year (2024/2025), not the birth year
3. **Duplicates missed**: The duplicate check queried 1990 but events exist in 2024/2025, so duplicates were not detected
4. **Result**: New events created even though duplicates already existed

## Example

- Person born: 1990-01-15
- Sync checks for duplicates in: 1990-01-01 to 1990-12-31
- Calendar event exists in: 2024-01-15 (recurring)
- Result: Duplicate check misses existing event, creates new duplicate

## Root Cause

Two methods had the bug:

1. **`write()` method**: Used `getDateRangeForBirthdays()` to determine date range for duplicate check
2. **`checkForDuplicates()` method**: Checked only the exact birth date, not the current year range

## Fix

**Changed duplicate check to use current year range:**

1. **In `write()` method**: Changed from birth year range to current year + next year range
   ```typescript
   // Before: Used getDateRangeForBirthdays(data) - birth year range
   // After: Use current year range
   const currentYear = new Date().getFullYear();
   const checkStartDate = new Date(currentYear, 0, 1);
   const checkEndDate = new Date(currentYear + 1, 11, 31);
   ```

2. **In `checkForDuplicates()` method**: 
   - Changed to check current year range instead of just birth date
   - Match by month/day pattern instead of exact date (since events are recurring)

**Files Changed:**
- `src/data-source/implementations/calendar.source.ts` - Fixed duplicate check date range logic

## Testing

- Run `yarn check-sync-status` to verify sync status
- Verify no duplicates are created when syncing existing birthdays
- Verify existing events are properly detected and skipped

## Prevention

1. **Always check current year range for recurring events**, not the original event date
2. **Match recurring events by pattern** (month/day) not exact date
3. **Test with birthdays from different years** to ensure duplicate detection works
4. **Use `check-sync-status` script** to verify sync status before and after changes

---

## Related Issues

- Duplicate birthday events created during Lambda concurrent execution
- Date range filtering bug in `fetchEvents` method

