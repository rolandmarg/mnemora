# Code Organization Guide

This document explains how the codebase is organized and the conventions we follow.

## File Structure

### Directory Organization

```
src/
├── data-source/       # Data source abstraction and implementations
│   ├── data-source.interface.ts
│   ├── data-source.base.ts
│   ├── data-source.factory.ts
│   └── implementations/  # Concrete data source implementations
│       ├── calendar.source.ts
│       └── sheets.source.ts
├── output-channel/    # Output channel abstraction and implementations
│   ├── output-channel.interface.ts
│   ├── output-channel.base.ts
│   ├── output-channel.factory.ts
│   └── implementations/  # Concrete output channel implementations
│       ├── console.channel.ts
│       └── whatsapp.channel.ts
├── services/          # Business logic (orchestration)
├── clients/           # External API clients (low-level)
├── utils/             # Utility functions (helpers)
├── scripts/           # CLI scripts (manual operations)
├── lambda/            # AWS Lambda handlers
├── config.ts          # Configuration loader
└── index.ts           # Main entry point
```

### Naming Conventions

- **Files**: kebab-case (e.g., `birthday-service.ts`)
- **Classes**: PascalCase (e.g., `BirthdayService`)
- **Functions**: camelCase (e.g., `getTodaysBirthdays`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `TEN_MINUTES`)
- **Interfaces**: PascalCase (e.g., `BirthdayRecord`)

## Code Organization Within Files

### 1. File Header
- Brief description of the file's purpose
- Any important notes or constraints

### 2. Imports
- Organized by category (see above)
- Grouped with comments

### 3. Helper Functions
- Private utility functions
- Grouped with section comments (`// ============================================================================`)

### 4. Main Functions
- Public/exported functions
- Clear documentation

### 5. Classes
- Properties first
- Constructor
- Public methods
- Private methods

## Function Organization

### Single Responsibility
Each function should do one thing well:
```typescript
// Good: Single responsibility
function getGroupId(channel: WhatsAppChannel | null): string {
  if (!channel || !channel.isAvailable()) {
    return 'unknown';
  }
  return channel.config?.whatsapp?.groupId || 'unknown';
}

// Bad: Multiple responsibilities
function processAndSend(message: string, channel: WhatsAppChannel): void {
  // Processing logic
  // Sending logic
  // Logging logic
}
```

### Helper Functions
Extract repeated logic into helper functions:
```typescript
// Helper function for common pattern
async function logMessage(
  messageId: string,
  messageType: MessageType,
  channel: WhatsAppChannel,
  content: string,
  success: boolean
): Promise<void> {
  // Centralized logging logic
}
```

### Clear Naming
Function names should clearly express intent:
```typescript
// Good: Clear intent
async function checkAndSendMissedDays(): Promise<void> { }

// Bad: Unclear intent
async function process(): Promise<void> { }
```

## Comments and Documentation

### When to Comment
- **Complex logic**: Explain why, not what
- **Business rules**: Document important decisions
- **Non-obvious code**: Clarify intent
- **Public APIs**: JSDoc comments

### Comment Style
```typescript
/**
 * Check and send monthly digest for latest missed 1st-of-month date
 * 
 * Only recovers the latest (most recent) missed monthly digest to avoid spamming.
 * Individual birthday messages are NOT recovered.
 */
async function checkAndSendMissedDays(): Promise<void> {
  // Implementation
}

// Inline comments for complex logic
// Rate limiting: wait 1 second between messages
await new Promise(resolve => setTimeout(resolve, 1000));
```

## Error Handling

### Consistent Pattern
```typescript
try {
  // Operation
} catch (error) {
  logger.error('Operation failed', error);
  // Handle error appropriately
  throw error; // Or handle gracefully
}
```

### Error Context
Always include context in error messages:
```typescript
logger.error('Error processing missed days', error, {
  missedDate: dateStr,
  stage: 'processing',
});
```

## Constants

Extract magic numbers and strings:
```typescript
// Good: Named constant
const TEN_MINUTES = 10 * 60 * 1000;
if (executionDuration > TEN_MINUTES) {
  // Alert
}

// Bad: Magic number
if (executionDuration > 600000) {
  // Alert
}
```

## Code Simplification

### Early Returns
Use early returns to reduce nesting:
```typescript
// Good: Early return
if (missedDates.length === 0) {
  return;
}

// Process missed dates...

// Bad: Deep nesting
if (missedDates.length > 0) {
  // Process missed dates...
}
```

### Extract Variables
Make code more readable:
```typescript
// Good: Clear variable names
const dateStr = lastMissedDate.toISOString().split('T')[0];
logger.info(`Processing date: ${dateStr}`);

// Bad: Inline complex expression
logger.info(`Processing date: ${lastMissedDate.toISOString().split('T')[0]}`);
```

## Testing

- Unit tests in `src/tests/`
- Test files mirror source structure
- Use descriptive test names

## Best Practices

1. **Keep functions small**: Single responsibility, easy to test
2. **Use descriptive names**: Code should be self-documenting
3. **Extract helpers**: Reduce duplication, improve readability
4. **Organize imports**: Group by category, easy to scan
5. **Add comments**: Explain why, not what
6. **Handle errors**: Always handle errors appropriately
7. **Use constants**: Extract magic numbers/strings
8. **Early returns**: Reduce nesting, improve readability

## Examples

### Well-Organized File
```typescript
/**
 * Birthday Service
 * 
 * Handles birthday data fetching and formatting.
 */

// External dependencies
import { format } from 'date-fns';

// Internal modules
import { logger } from './utils/logger.js';
import { today } from './utils/date-helpers.js';

// ============================================================================
// Constants
// ============================================================================

const BIRTHDAY_EMOJI = '🎂';

// ============================================================================
// Helper Functions
// ============================================================================

function formatBirthdayMessage(name: string): string {
  return `${BIRTHDAY_EMOJI} ${name}`;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get today's birthdays
 */
export async function getTodaysBirthdays(): Promise<BirthdayRecord[]> {
  // Implementation
}
```

This organization makes the codebase easier to navigate, understand, and maintain.

