# Features

## Overview

This document lists all features of the Mnemora birthday reminder bot.

---

## Core Features

### 1. Two-Way Communication

**Description:**
- Users can interact with the bot via WhatsApp
- Bot can receive messages and respond accordingly
- Supports interactive commands and responses

**Use Cases:**
- Users can send commands to add birthdays
- Users can query birthdays on demand
- Bot can respond to user queries and confirmations

**Status:** 🚧 Planned

---

### 2. Add Birthdays

**Description:**
- Users can add birthdays to the calendar
- Supports multiple input formats (name, date, optional year)
- Validates and sanitizes input data
- Checks for duplicates before adding

**Current Implementation:**
- ✅ Command-line script: `add-birthday.ts`
- ✅ Interactive mode with confirmation
- ✅ Duplicate detection
- ✅ Name sanitization
- ✅ Date parsing (multiple formats)

**Planned Enhancements:**
- 🚧 Add via WhatsApp messages
- 🚧 Add via voice messages
- 🚧 Bulk import from messages

**Status:** ✅ Partially Implemented (CLI only)

---

### 3. Fetch Birthdays on Demand

**Description:**
- Users can query birthdays at any time
- Supports various query types:
  - Today's birthdays
  - Upcoming birthdays (this month)
  - Specific date birthdays
  - Search by name

**Current Implementation:**
- ✅ Daily automatic check (9am)
- ✅ Monthly digest (1st of month)
- ✅ Command-line script: `check-all-events.ts`

**Planned Enhancements:**
- 🚧 Query via WhatsApp messages
- 🚧 Query specific dates
- 🚧 Search by name
- 🚧 Get upcoming birthdays (next N days)

**Status:** ✅ Partially Implemented (CLI only)

---

### 4. Abstract Communication Channel

**Description:**
- Communication layer is abstracted from business logic
- Supports multiple communication channels:
  - WhatsApp (current)
  - Future: SMS, Email, Telegram, etc.
- Easy to switch or add new channels

**Current Implementation:**
- ✅ WhatsApp service abstraction (`whatsapp.ts`)
- ✅ Birthday service separated from communication
- ✅ Configurable communication channel

**Planned Enhancements:**
- 🚧 Abstract communication interface
- 🚧 Multiple channel support
- 🚧 Channel-specific message formatting
- 🚧 Fallback channels

**Status:** 🚧 In Progress

---

### 5. Add Birthday Groups

**Description:**
- Users can create and manage birthday groups
- Group birthdays together (e.g., "Family", "Work", "Friends")
- Send group-specific birthday reminders
- Manage group members

**Planned Features:**
- 🚧 Create birthday groups
- 🚧 Add birthdays to groups
- 🚧 Remove birthdays from groups
- 🚧 List all groups
- 🚧 Group-specific reminders
- 🚧 Group member management

**Status:** 🚧 Planned

---

### 6. Add Personal Friend Birthdays

**Description:**
- Users can add personal friend birthdays
- Distinguish between different types of birthdays:
  - Personal friends
  - Family members
  - Work colleagues
  - Group birthdays
- Support for different reminder preferences per type

**Current Implementation:**
- ✅ Add any birthday (no distinction yet)
- ✅ Birthday events stored in Google Calendar

**Planned Enhancements:**
- 🚧 Categorize birthdays (friend, family, work, etc.)
- 🚧 Different reminder messages per category
- 🚧 Privacy settings per category
- 🚧 Personal vs. group birthday distinction

**Status:** 🚧 Planned

---

## Feature Status Legend

- ✅ **Implemented** - Feature is fully working
- 🚧 **In Progress** - Feature is partially implemented
- 📋 **Planned** - Feature is planned but not yet started
- ❌ **Deprecated** - Feature is no longer supported

---

## Feature Roadmap

### Phase 1: Core Functionality (Current)
- ✅ Add birthdays via CLI
- ✅ Fetch birthdays on demand (CLI)
- ✅ Daily birthday reminders
- ✅ Monthly digest
- ✅ Duplicate detection
- ✅ Name sanitization
- ✅ Date parsing

### Phase 2: Communication Enhancement
- 🚧 Two-way WhatsApp communication
- 🚧 Add birthdays via WhatsApp
- 🚧 Query birthdays via WhatsApp
- 🚧 Abstract communication channel
- 🚧 Multiple channel support

### Phase 3: Group Management
- 📋 Birthday groups
- 📋 Group-specific reminders
- 📋 Group member management
- 📋 Group permissions

### Phase 4: Advanced Features
- 📋 Personal friend birthdays
- 📋 Birthday categorization
- 📋 Custom reminder messages
- 📋 Privacy settings
- 📋 Birthday statistics
- 📋 Birthday history

---

## Implementation Details

### Current Architecture

```
┌─────────────────┐
│  Communication  │  (WhatsApp - Current)
│     Channel     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Birthday       │  (Business Logic)
│    Service      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Calendar       │  (Google Calendar)
│    Service      │
└─────────────────┘
```

### Planned Architecture

```
┌─────────────────┐
│  Communication  │  (Abstract Interface)
│     Channel      │  ├─ WhatsApp
│   (Abstract)     │  ├─ SMS
│                  │  ├─ Email
│                  │  └─ Telegram
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Birthday       │  (Business Logic)
│    Service      │  ├─ Add Birthdays
│                 │  ├─ Query Birthdays
│                 │  ├─ Group Management
│                 │  └─ Categorization
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Calendar       │  (Google Calendar)
│    Service      │
└─────────────────┘
```

---

## Feature Requests

### High Priority
1. **Two-way WhatsApp communication** - Enable users to interact with bot
2. **Add birthdays via WhatsApp** - Users can add birthdays by messaging bot
3. **Query birthdays via WhatsApp** - Users can ask "who has a birthday today?"

### Medium Priority
1. **Birthday groups** - Organize birthdays into groups
2. **Abstract communication channel** - Support multiple channels
3. **Personal friend birthdays** - Distinguish between different types

### Low Priority
1. **Birthday statistics** - Show birthday analytics
2. **Custom reminder messages** - Personalized messages per birthday
3. **Birthday history** - Track past birthday messages

---

## Notes

- All features should maintain backward compatibility
- Features should be opt-in where possible
- Communication abstraction should be implemented early to avoid refactoring later
- Group management requires database or additional storage (currently using Google Calendar only)

---

## Related Documentation

- `CLOUD_DEPLOYMENT_RECOMMENDATION.md` - Deployment options
- `WHATSAPP_CLOUD_API_SETUP.md` - WhatsApp setup
- `BIRTHDAY_MESSAGING_ANALYSIS.md` - Messaging strategy
- `GROUP_MESSAGING_OPTIONS.md` - Group messaging options

