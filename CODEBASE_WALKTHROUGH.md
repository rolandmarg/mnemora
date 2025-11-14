# Mnemora Codebase Walkthrough

Complete guide to understanding the architecture and codebase structure.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY POINTS                              │
│  index.ts (main) | scripts/*.ts (CLI tools)                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                             │
│              services/birthday.ts                            │
│  (Business logic: formatting, digest generation)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────┐        ┌──────────────────┐
│  DATA SOURCES     │        │ OUTPUT CHANNELS   │
│  (Read/Write)      │        │  (Send Messages)  │
│                   │        │                   │
│  Calendar         │        │  Console          │
│  Sheets           │        │  WhatsApp          │
└────────┬──────────┘        │  SMS              │
         │                   │  Email            │
         ▼                   └────────┬─────────┘
┌──────────────────┐                  │
│  API CLIENTS      │                  │
│                   │                  │
│  Google Calendar  │                  │
│  Google Sheets    │                  │
└───────────────────┘                  │
                                       │
                              ┌────────┴────────┐
                              │                 │
                              ▼                 ▼
                    ┌──────────────┐  ┌──────────────┐
                    │ WhatsApp Web │  │  Twilio API   │
                    │     API      │  │  (Future)     │
                    └──────────────┘  └──────────────┘
```

---

## 📁 Directory Structure

### **Root Level Files**

#### `src/index.ts` - Main Entry Point
**Purpose**: Daily birthday check automation (runs via cron/launchd)

**Flow**:
1. Checks for missed days (if service was down)
2. Gets today's birthdays + optional monthly digest
3. Sends monthly digest to WhatsApp (if 1st of month)
4. Sends individual birthday messages to WhatsApp
5. Updates last run tracker

**Key Functions**:
- `checkAndSendMissedDays()`: Recovery mechanism for missed scheduled runs
- `runBirthdayCheck()`: Main orchestration logic

---

### **Interfaces** (`src/interfaces/`)

#### `data-source.interface.ts`
**Purpose**: Contract for all data sources

**Key Types**:
- `DataSource<T>`: Generic interface for reading/writing data
- `ReadOptions`: Date ranges, filters
- `WriteResult`: Counts of added/skipped/errors
- `DataSourceMetadata`: Capabilities and description

**Why**: Enables swapping data sources (Calendar ↔ Sheets ↔ future sources) without changing business logic.

#### `output-channel.interface.ts`
**Purpose**: Contract for all notification channels

**Key Types**:
- `OutputChannel`: Interface for sending messages
- `SendOptions`: Recipients, subject, priority
- `SendResult`: Success status, message ID, errors
- `OutputChannelMetadata`: Channel capabilities

**Why**: Enables swapping channels (WhatsApp ↔ SMS ↔ Email) without changing business logic.

---

### **Base Classes** (`src/base/`)

#### `base-data-source.ts`
**Purpose**: Abstract base class for all data sources

**Provides**:
- Default implementations for optional methods (`write`, `delete`, `deleteAll`)
- Error throwing for unsupported operations
- Config injection via constructor

**Pattern**: Template Method Pattern - defines structure, subclasses implement specifics.

#### `base-output-channel.ts`
**Purpose**: Abstract base class for all output channels

**Provides**:
- Default `sendToMultiple()` implementation (sends to each recipient individually)
- Abstract methods that must be implemented: `send()`, `isAvailable()`, `getMetadata()`

**Pattern**: Template Method Pattern - base provides common behavior, subclasses customize.

---

### **Data Sources** (`src/sources/`)

#### `calendar.source.ts`
**Purpose**: Adapter between Google Calendar API and `BirthdayRecord[]`

**Extends**: `BaseDataSource<BirthdayRecord>`

**Key Methods**:
- `read()`: Fetches events from calendar, filters birthdays, converts to `BirthdayRecord[]`
- `write()`: Batch writes with duplicate detection (optimized: N+1 API calls instead of 2N)
- `delete()`: Deletes single event
- `deleteAll()`: Bulk deletion by date range

**Data Flow**:
```
Calendar API Event → eventToBirthdayRecord() → BirthdayRecord
```

**Optimizations**:
- Batch fetches existing birthdays before writing (avoids N+1 problem)
- Uses lookup map for duplicate detection

#### `sheets.source.ts`
**Purpose**: Adapter between Google Sheets API and `BirthdayRecord[]`

**Extends**: `BaseDataSource<BirthdayRecord>`

**Key Methods**:
- `read()`: Reads from sheets, converts rows to `BirthdayRecord[]`
- `isAvailable()`: Checks if sheets credentials are configured

**Note**: Read-only (no `write()` implementation)

---

### **Output Channels** (`src/channels/`)

#### `whatsapp.channel.ts`
**Purpose**: WhatsApp messaging via whatsapp-web.js

**Extends**: `BaseOutputChannel`

**Key Features**:
- QR code authentication (terminal display)
- Session persistence (`.wwebjs_auth/` directory)
- Group messaging by name
- Automatic reconnection handling

**Key Methods**:
- `send()`: Sends message to WhatsApp group
- `initializeClient()`: Handles QR code flow, authentication
- `findGroupByName()`: Resolves group ID from name
- `destroy()`: Cleanup (preserves session)

**Lifecycle**:
1. First run: Shows QR code in terminal
2. User scans with WhatsApp mobile app
3. Session saved to `.wwebjs_auth/`
4. Future runs: Auto-connects using saved session

#### `console.channel.ts`
**Purpose**: Outputs messages to console (for CLI scripts)

**Extends**: `BaseOutputChannel`

**Simple Implementation**: Just `console.log()` messages

#### `sms.channel.ts` & `email.channel.ts`
**Purpose**: Placeholders for future implementations

**Status**: Stubs that return "not implemented" errors

---

### **API Clients** (`src/clients/`)

#### `google-calendar.client.ts`
**Purpose**: Low-level Google Calendar API wrapper

**Responsibilities**:
- Authenticates with Google using service account
- Fetches events from calendar
- Inserts new events
- Deletes events
- Converts Google API types → internal `Event` type

**Key Methods**:
- `fetchEvents()`: Gets events in date range
- `insertEvent()`: Creates new event
- `deleteEvent()`: Removes event by ID
- `deleteAllEvents()`: Bulk deletion

**Separation**: This is the ONLY file that knows about Google Calendar API types. All other code uses internal `Event` type.

#### `google-sheets.client.ts`
**Purpose**: Low-level Google Sheets API wrapper

**Responsibilities**:
- Authenticates with Google using service account
- Reads rows from spreadsheet
- Converts sheet rows → `BirthdayRecord[]`

**Separation**: This is the ONLY file that knows about Google Sheets API. All other code uses `BirthdayRecord[]`.

---

### **Factories** (`src/factories/`)

#### `data-source.factory.ts`
**Purpose**: Creates data source instances

**Methods**:
- `createCalendarDataSource()`: Returns `CalendarDataSource`
- `createSheetsDataSource()`: Returns `SheetsDataSource`

**Why Factory Pattern**:
- Centralized creation logic
- Type-safe (no string-based lookups)
- Easy to add new sources without changing callers

#### `output-channel.factory.ts`
**Purpose**: Creates output channel instances

**Methods**:
- `createConsoleOutputChannel()`: Returns `ConsoleOutputChannel`
- `createWhatsAppOutputChannel()`: Returns `WhatsAppOutputChannel`
- `createSMSOutputChannel()`: Returns `SMSOutputChannel`
- `createEmailOutputChannel()`: Returns `EmailOutputChannel`

**Why Factory Pattern**: Same as data sources - centralized, type-safe creation.

---

### **Services** (`src/services/`)

#### `birthday.ts` - BirthdayService
**Purpose**: Business logic layer - orchestrates data sources and formatting

**Key Responsibilities**:
1. **Data Fetching**: Uses data sources to get birthdays
2. **Message Formatting**: Creates personalized messages with emojis
3. **Digest Generation**: Creates monthly digest with aligned formatting
4. **Data Synchronization**: Syncs Sheets → Calendar

**Key Methods**:

- `getTodaysBirthdays()`: Gets today's birthdays from calendar
- `getTodaysBirthdaysWithOptionalDigest()`: Smart method that checks if it's 1st of month
- `getTodaysBirthdaysWithMonthlyDigest()`: Optimized - fetches entire month once, filters today, generates digest
- `formatTodaysBirthdayMessages()`: Creates personalized messages: `🎂 🎉 Name`
- `getTodaysBirthdaysWithMonthlyDigest()`: Formats monthly digest with aligned dates:
  ```
  🎂 Nov 8:  Martin 🎭
  🎂 Nov 15: Sarah 🎨, John 🎵
  ```
- `readFromSheets()`: Reads birthdays from Google Sheets
- `syncToCalendar()`: Writes birthdays from Sheets to Calendar

**Design**: Service layer doesn't know about specific implementations - uses factories and interfaces.

---

### **Configuration** (`src/config.ts`)

**Purpose**: Centralized configuration loader

**Loads from**:
- Environment variables (`.env` file)
- Defaults for optional values

**Structure**:
```typescript
{
  google: { calendarId, spreadsheetId, clientEmail, privateKey, projectId },
  whatsapp: { groupId, headless },
  schedule: { time, timezone }
}
```

**Why**: Single source of truth for all configuration.

---

### **Utilities** (`src/utils/`)

#### `date-helpers.ts`
**Purpose**: Timezone-aware date manipulation

**Key Functions**:
- `today()`: Gets today's date in configured timezone
- `startOfDay()`, `endOfDay()`: Normalize dates
- `formatDateShort()`: "Nov 8" format
- `formatDateMonthYear()`: "November 2024" format
- `isFirstDayOfMonth()`: Check if date is 1st of month

#### `name-helpers.ts`
**Purpose**: Name parsing and formatting

**Key Functions**:
- `getFullName()`: Combines first + last name
- `extractNameParts()`: Splits full name into first/last
- `sanitizeName()`: Cleans input names

#### `birthday-helpers.ts`
**Purpose**: Birthday record utilities

**Key Types**:
- `BirthdayRecord`: Core data type
  ```typescript
  {
    firstName: string;
    lastName?: string;
    birthday: Date;
    year?: number;
  }
  ```

**Key Functions**:
- `getDateRangeForBirthdays()`: Calculates min/max dates for batch operations

#### `event-helpers.ts`
**Purpose**: Calendar event utilities

**Key Types**:
- `Event`: Internal event representation (abstracted from Google API)

**Key Functions**:
- `isBirthdayEvent()`: Checks if event is a birthday
- `extractNameFromEvent()`: Gets name from event summary
- `eventToBirthdayRecord()`: Converts Event → BirthdayRecord

#### `logger.ts`
**Purpose**: Structured logging wrapper around `pino`

**Usage**: `logger.info()`, `logger.error()`, `logger.warn()`

**Why**: Centralized logging configuration, easy to swap implementations.

#### `last-run-tracker.ts`
**Purpose**: Tracks last successful run date for missed days recovery

**Functions**:
- `readLastRunDate()`: Reads from `logs/last-run.txt`
- `updateLastRunDate()`: Writes current date
- `getMissedDates()`: Calculates missed dates between last run and today

---

### **Scripts** (`src/scripts/`)

#### `get-todays-birthdays.ts`
**Purpose**: CLI script to display today's birthdays

**Flow**:
1. Gets today's birthdays via `birthdayService`
2. Outputs to console

#### `get-monthly-digest.ts`
**Purpose**: CLI script to display monthly digest

**Flow**:
1. Gets monthly digest via `birthdayService`
2. Outputs to console

#### `get-all-birthdays.ts`
**Purpose**: CLI script to read from Sheets, sync to Calendar, display all

**Flow**:
1. Reads from Sheets
2. Syncs to Calendar (with duplicate detection)
3. Displays all birthdays via console channel

#### `delete-events.ts`
**Purpose**: CLI script to delete birthday events

**Options**:
- `--all`: Delete all events
- `--date-range`: Delete events in date range

#### `manual-send.ts`
**Purpose**: Manually trigger birthday messages

**Flow**:
1. Checks for missed days
2. Always sends monthly digest (regardless of date)
3. Sends today's birthday messages
4. Updates last run tracker

#### `send-monthly-digest-whatsapp.ts`
**Purpose**: Standalone script to send monthly digest to WhatsApp

**Flow**:
1. Gets monthly digest
2. Creates WhatsApp channel
3. Sends to configured group

#### `send-test-message-whatsapp.ts`
**Purpose**: Test WhatsApp connectivity

**Flow**:
1. Takes group name and message as arguments
2. Sends test message

---

## 🔄 Data Flow Examples

### Example 1: Daily Birthday Check (`index.ts`)

```
1. index.ts → birthdayService.getTodaysBirthdaysWithOptionalDigest()
   │
   ├─→ birthdayService checks if 1st of month
   │
   ├─→ If 1st: getTodaysBirthdaysWithMonthlyDigest()
   │   │
   │   └─→ calendarSource.read({ startDate: monthStart, endDate: monthEnd })
   │       │
   │       └─→ calendarClient.fetchEvents()
   │           │
   │           └─→ Google Calendar API
   │
   └─→ Else: getTodaysBirthdays()
       │
       └─→ calendarSource.read({ startDate: today, endDate: today })
           │
           └─→ calendarClient.fetchEvents()
               │
               └─→ Google Calendar API

2. index.ts → whatsappChannel.send(monthlyDigest)
   │
   └─→ WhatsAppOutputChannel.send()
       │
       └─→ whatsapp-web.js Client
           │
           └─→ WhatsApp Web API
```

### Example 2: Reading from Sheets and Syncing to Calendar

```
1. get-all-birthdays.ts → birthdayService.readFromSheets()
   │
   └─→ sheetsSource.read()
       │
       └─→ sheetsClient.readBirthdays()
           │
           └─→ Google Sheets API

2. get-all-birthdays.ts → birthdayService.syncToCalendar(birthdays)
   │
   └─→ calendarSource.write(birthdays)
       │
       ├─→ calendarSource.read() [batch fetch existing for duplicate check]
       │   │
       │   └─→ calendarClient.fetchEvents()
       │
       └─→ calendarClient.insertEvent() [for each new birthday]
           │
           └─→ Google Calendar API
```

---

## 🎯 Design Patterns Used

### 1. **Strategy Pattern**
- Runtime selection of data sources (Calendar vs Sheets)
- Runtime selection of output channels (WhatsApp vs SMS vs Email)

### 2. **Factory Pattern**
- `DataSourceFactory`: Creates data source instances
- `OutputChannelFactory`: Creates output channel instances

### 3. **Template Method Pattern**
- `BaseDataSource`: Defines structure, subclasses implement
- `BaseOutputChannel`: Defines structure, subclasses implement

### 4. **Adapter Pattern**
- `CalendarDataSource`: Adapts Google Calendar API → `BirthdayRecord[]`
- `SheetsDataSource`: Adapts Google Sheets API → `BirthdayRecord[]`
- `WhatsAppOutputChannel`: Adapts whatsapp-web.js → `OutputChannel` interface

### 5. **Dependency Injection**
- Config injected via constructors
- Services depend on interfaces, not concrete classes

---

## 🔌 Extension Points

### Adding a New Data Source

1. Create class extending `BaseDataSource<BirthdayRecord>`
2. Implement required methods: `read()`, `isAvailable()`, `getMetadata()`
3. Add factory method: `DataSourceFactory.createNewSource()`
4. Use in `BirthdayService` or scripts

### Adding a New Output Channel

1. Create class extending `BaseOutputChannel`
2. Implement required methods: `send()`, `isAvailable()`, `getMetadata()`
3. Add factory method: `OutputChannelFactory.createNewChannel()`
4. Use in `index.ts` or scripts

---

## 🧪 Testing

### Test Files (`src/tests/`)

- `date.test.ts`: Tests date helper functions
- `name-helpers.test.ts`: Tests name parsing and formatting

**Note**: More comprehensive test coverage can be added following these patterns.

---

## 📝 Key Takeaways

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Dependency Inversion**: High-level code depends on abstractions (interfaces)
3. **Open/Closed Principle**: Easy to extend without modifying existing code
4. **Type Safety**: Strict TypeScript, no `any` types
5. **Factory Pattern**: Centralized, type-safe instance creation
6. **Adapter Pattern**: External APIs adapted to internal types

---

## 🚀 Entry Points Summary

| File | Purpose | When to Use |
|------|---------|-------------|
| `index.ts` | Daily automated check | Scheduled via cron/launchd |
| `get-todays-birthdays.ts` | Display today's birthdays | CLI debugging |
| `get-monthly-digest.ts` | Display monthly digest | CLI debugging |
| `get-all-birthdays.ts` | Read from Sheets, sync to Calendar | Data migration |
| `delete-events.ts` | Delete birthday events | Cleanup |
| `manual-send.ts` | Manually send messages | Testing, bootup prompt |
| `send-monthly-digest-whatsapp.ts` | Send digest to WhatsApp | Manual trigger |
| `send-test-message-whatsapp.ts` | Test WhatsApp | Debugging |

---

This architecture enables:
- ✅ Easy testing (mock interfaces)
- ✅ Easy extension (add new sources/channels)
- ✅ Easy maintenance (clear boundaries)
- ✅ Type safety (compile-time checks)
- ✅ Flexibility (swap implementations)

