# Architecture Documentation

## Overview

This directory contains the architecture for a flexible, extensible system that supports multiple data sources and output channels.

## Directory Structure

```
architecture/
├── interfaces/          # Core interfaces (contracts)
│   ├── data-source.interface.ts
│   └── output-channel.interface.ts
├── factories/          # Factory classes for creating instances
│   ├── data-source.factory.ts
│   └── output-channel.factory.ts
├── sources/            # Data source implementations
│   ├── calendar.source.ts    # Google Calendar (implemented)
│   ├── sheets.source.ts      # Google Sheets (implemented)
│   ├── csv.source.ts         # CSV files (placeholder)
│   └── contacts.source.ts    # Device contacts (placeholder)
├── channels/           # Output channel implementations
│   ├── console.channel.ts    # Console logging (implemented)
│   ├── sms.channel.ts        # SMS via Twilio (placeholder)
│   ├── whatsapp.channel.ts  # WhatsApp via Twilio (placeholder)
│   └── email.channel.ts      # Email (placeholder)
├── examples/           # Usage examples
│   └── usage.example.ts
├── types/              # Shared types
│   └── index.ts
├── ARCHITECTURE.md     # Architecture overview
└── README.md           # This file
```

## Quick Start

### Using a Single Data Source

```typescript
import { DataSourceFactory } from './architecture/factories/data-source.factory.js';
import { OutputChannelFactory } from './architecture/factories/output-channel.factory.js';

// Create a calendar data source
const calendarSource = DataSourceFactory.create('calendar');

// Read birthdays
const birthdays = await calendarSource.read({
  startDate: new Date(),
  endDate: new Date(),
});

// Create output channel
const consoleChannel = OutputChannelFactory.create('console');

// Send message
await consoleChannel.send(`Found ${birthdays.length} birthdays!`);
```

### Using Multiple Data Sources and Channels

```typescript
// Create multiple sources
const sources = DataSourceFactory.createMultiple([
  { type: 'calendar' },
  { type: 'sheets' },
]);

// Create multiple channels
const channels = OutputChannelFactory.createMultiple([
  { type: 'console', enabled: true },
  { type: 'sms', enabled: true },
  { type: 'whatsapp', enabled: true },
]);

// Read from all sources
const allBirthdays = await Promise.all(
  sources.map(source => source.read())
);

// Send to all channels
const message = `Found ${allBirthdays.flat().length} birthdays!`;
await Promise.all(
  channels.map(channel => channel.send(message))
);
```

## Adding a New Data Source

1. Create a new file in `sources/` (e.g., `database.source.ts`)
2. Implement the `IDataSource<T>` interface
3. Add the type to `DataSourceType` in `types/index.ts`
4. Add a case in `DataSourceFactory.create()`

Example:

```typescript
// sources/database.source.ts
export class DatabaseDataSource implements IDataSource<BirthdayEvent> {
  async read(options?: ReadOptions): Promise<BirthdayEvent[]> {
    // Implement reading from database
  }
  
  isAvailable(): boolean {
    // Check if database is configured
  }
  
  getMetadata(): DataSourceMetadata {
    return {
      name: 'Database',
      type: 'database',
      // ...
    };
  }
}
```

## Adding a New Output Channel

1. Create a new file in `channels/` (e.g., `telegram.channel.ts`)
2. Implement the `IOutputChannel` interface
3. Add the type to `OutputChannelType` in `types/index.ts`
4. Add a case in `OutputChannelFactory.create()`

Example:

```typescript
// channels/telegram.channel.ts
export class TelegramOutputChannel implements IOutputChannel {
  async send(message: string, options?: SendOptions): Promise<SendResult> {
    // Implement Telegram sending
  }
  
  async sendToMultiple(recipients: string[], message: string, options?: SendOptions): Promise<SendResult[]> {
    // Implement multiple recipient sending
  }
  
  isAvailable(): boolean {
    // Check if Telegram is configured
  }
  
  getMetadata(): OutputChannelMetadata {
    return {
      name: 'Telegram',
      type: 'telegram',
      // ...
    };
  }
}
```

## Migration Guide

### Step 1: Use Adapters for Existing Services

The existing `CalendarService` and `SheetsService` are wrapped in adapters (`CalendarDataSource`, `SheetsDataSource`) that implement the `IDataSource` interface. These can be used immediately.

### Step 2: Refactor Services to Use Dependency Injection

Instead of directly importing services, inject them:

```typescript
// Before
import calendarService from './services/calendar.js';
const events = await calendarService.getEventsForDate(date);

// After
import { DataSourceFactory } from './architecture/factories/data-source.factory.js';
const source = DataSourceFactory.create('calendar');
const events = await source.read({ startDate: date });
```

### Step 3: Add New Sources/Channels as Needed

When you need CSV, Contacts, Email, etc., implement the interfaces and add them to the factories.

## Benefits

- ✅ **Extensible**: Add new sources/channels without modifying existing code
- ✅ **Testable**: Mock interfaces in tests
- ✅ **Flexible**: Mix and match sources/channels
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Clear contracts**: Interfaces define expectations

## Next Steps

1. Implement placeholder sources/channels (CSV, Contacts, Email)
2. Refactor existing services to use the new architecture
3. Add configuration support for multiple sources/channels
4. Add error handling and retry logic
5. Add logging and monitoring

