# Bugs and Fixes

This directory tracks bugs found and fixed in the Mnemora project.

## Purpose

Documenting bugs and their fixes helps:
- Understand why certain code changes were made
- Prevent similar bugs in the future
- Provide context for code reviews
- Track patterns and recurring issues

## Format

Each bug fix document follows this structure:
- **Date:** When the bug was fixed
- **Severity:** Critical, High, Medium, Low
- **Status:** Fixed, In Progress, Known Issue
- **Summary:** Brief overview
- **Problem:** What was wrong
- **Impact:** What was affected
- **Root Cause:** Why it happened
- **Fix:** How it was resolved
- **Files Changed:** List of modified files
- **Testing:** How it was verified

## Bug Fixes

### 2025-11-20
- [Lambda Duplicates and Date Range Bug](./2025-11-20-lambda-duplicates-and-date-range-bug.md)
  - Fixed Lambda concurrent execution causing duplicate events
  - Fixed `fetchEvents` date range filtering bug
- [Sync Logic Bug - Duplicate Check Using Wrong Date Range](./2025-11-20-sync-logic-bug.md)
  - Fixed duplicate check using birth year range instead of current year range
  - Fixed recurring event duplicate detection

## Contributing

When fixing a bug:
1. Create a new markdown file: `YYYY-MM-DD-brief-description.md`
2. Follow the format above
3. Update this README with a link to the new fix
4. Reference the fix in commit messages when possible

