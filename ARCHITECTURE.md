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
- `SMSOutputChannel`, `WhatsAppOutputChannel`, `EmailOutputChannel`: Placeholders

### Factories

Create instances using Factory Pattern:

```typescript
const calendarSource = DataSourceFactory.create('calendar');
const consoleChannel = OutputChannelFactory.create('console');
```

## Data Flow

### Reading Birthdays

1. Script → `birthdayService.getTodaysBirthdays()`
2. Service → `DataSourceFactory.create('calendar')`
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
- Factories use function overloads for type-safe creation
- No `any` types (strict TypeScript)

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
export type DataSourceType = 'calendar' | 'sheets' | 'csv';
static create(type: 'csv'): CSVDataSource;
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
export type OutputChannelType = 'console' | 'sms' | 'whatsapp' | 'email' | 'telegram';
static create(type: 'telegram'): TelegramOutputChannel;
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
- Data sources: Return error counts in results
- Output channels: Return `SendResult` with success/error status
- Scripts: Catch errors, log, and exit with appropriate codes
