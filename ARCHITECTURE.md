# Architecture

Mnemora uses a **layered architecture** with Strategy and Factory patterns for extensibility.

## Overview

```
CLI Scripts → Birthday Service → Data Sources / Output Channels → API Clients
```

## Core Components

### Data Sources

Abstract interface for reading/writing birthday data.

**Interface:**
```typescript
interface DataSource<T> {
  read(options?: ReadOptions): Promise<T[]>;
  write?(data: T[], options?: WriteOptions): Promise<WriteResult>;
  delete?(id: string): Promise<boolean>;
  deleteAll?(options: ReadOptions): Promise<DeleteResult>;
  isAvailable(): boolean;
  getMetadata(): DataSourceMetadata;
}
```

**Implementations:**
- `CalendarDataSource`: Reads/writes from Google Calendar
- `SheetsDataSource`: Reads from Google Sheets (read-only)

### Output Channels

Abstract interface for sending notifications.

**Interface:**
```typescript
interface OutputChannel {
  send(message: string, options?: SendOptions): Promise<SendResult>;
  sendToMultiple(recipients: string[], message: string, options?: SendOptions): Promise<SendResult[]>;
  isAvailable(): boolean;
  getMetadata(): OutputChannelMetadata;
}
```

**Implementations:**
- `ConsoleOutputChannel`: Outputs to console (fully implemented)
- `WhatsAppOutputChannel`: Sends messages via whatsapp-web.js (fully implemented)
- `SMSOutputChannel`: Placeholder for Twilio SMS
- `EmailOutputChannel`: Placeholder for email notifications

### Factories

Create instances using Factory Pattern with type-safe method names:

```typescript
const calendarSource = DataSourceFactory.createCalendarDataSource();
const sheetsSource = DataSourceFactory.createSheetsDataSource();
const consoleChannel = OutputChannelFactory.createConsoleOutputChannel();
const whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
```

**Note:** Factories use explicit method names (e.g., `createCalendarDataSource()`) rather than string-based `create()` for better type safety and IDE autocomplete support.

## Data Flow

### Reading Birthdays

1. Script → `birthdayService.getTodaysBirthdays()`
2. Service → `DataSourceFactory.createCalendarDataSource()`
3. Data Source → `calendarClient.fetchEvents()`
4. Client → Google Calendar API
5. Data Source converts `Event[]` → `BirthdayRecord[]`
6. Service returns `BirthdayRecord[]`

### Writing Birthdays

1. Script → `birthdayService.addBirthday()` or data source directly
2. Data Source checks duplicates via `read()`
3. Data Source → `calendarClient.insertEvent()`
4. Client → Google Calendar API
5. Returns `WriteResult` with counts

## Design Patterns

- **Strategy Pattern**: Runtime selection of data sources/output channels
- **Factory Pattern**: Type-safe instance creation
- **Template Method Pattern**: Base classes define structure, subclasses implement
- **Adapter Pattern**: Convert external API types to internal types

## Type System

### Core Types

```typescript
interface BirthdayRecord {
  firstName: string;
  lastName?: string;
  birthday: Date;
  year?: number;
}

interface Event {
  id?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; };
  // ...
}
```

### Type Safety

- All data sources return `BirthdayRecord[]` (unified type)
- Factories use explicit method names for type-safe creation (e.g., `createCalendarDataSource()`)
- All classes extend base classes (`BaseDataSource<T>`, `BaseOutputChannel`)
- No `any` types (strict TypeScript)
- Interfaces enforce contracts at compile time

## Extension Points

### Adding a New Data Source

```typescript
export class CSVDataSource extends BaseDataSource<BirthdayRecord> {
  constructor(config: AppConfig) { super(config); }
  
  async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
    // Implementation
  }
  
  isAvailable(): boolean { /* ... */ }
  getMetadata(): DataSourceMetadata { /* ... */ }
}
```

Add to `DataSourceFactory`:
```typescript
static createCSVDataSource(): CSVDataSource {
  return new CSVDataSource(config);
}
```

### Adding a New Output Channel

```typescript
export class TelegramOutputChannel extends BaseOutputChannel {
  async send(message: string, options?: SendOptions): Promise<SendResult> {
    // Implementation
  }
  
  isAvailable(): boolean { /* ... */ }
  getMetadata(): OutputChannelMetadata { /* ... */ }
}
```

Add to `OutputChannelFactory`:
```typescript
static createTelegramOutputChannel(): TelegramOutputChannel {
  return new TelegramOutputChannel(config);
}
```

## Performance

- **CalendarDataSource.write()**: Batch-fetches existing birthdays (N+1 → N+1 API calls)
- **GoogleSheetsClient**: Caches sheet names
- **BirthdayService.getTodaysBirthdaysWithMonthlyDigest()**: Fetches entire month once

## Key Utilities

- **date-helpers.ts**: Timezone-aware date manipulation
- **birthday-helpers.ts**: Birthday record parsing and utilities
- **name-helpers.ts**: Name sanitization and parsing
- **event-helpers.ts**: Calendar event utilities
- **logger.ts**: Structured logging wrapper around `pino`

## Error Handling

- Service layer: Catches, logs, and re-throws with context
- Data sources: Return error counts in results (`WriteResult`, `DeleteResult`)
- Output channels: Return `SendResult` with success/error status
- Scripts: Catch errors, log, and exit with appropriate codes
- All async operations wrapped in try/catch blocks
- Structured logging with `pino` for error tracking

## Architecture Compliance

### ✅ Current Implementation Status

- **All data sources** extend `BaseDataSource<BirthdayRecord>` ✅
- **All output channels** extend `BaseOutputChannel` ✅
- **All instantiations** go through factories ✅
- **No direct instantiations** of concrete classes outside factories ✅
- **Interfaces properly defined** and implemented ✅
- **Type safety** enforced throughout ✅
- **Base classes** provide default implementations where appropriate ✅

### Best Practices Followed

1. **Separation of Concerns**: Clear boundaries between data sources, output channels, and services
2. **Dependency Inversion**: High-level modules depend on abstractions (interfaces), not concrete implementations
3. **Open/Closed Principle**: Easy to extend with new data sources/channels without modifying existing code
4. **Single Responsibility**: Each class has one clear purpose
5. **Factory Pattern**: Centralized creation logic with type safety
6. **Template Method Pattern**: Base classes define structure, subclasses implement specifics
