# 🎂 Mnemora

> *Never miss another birthday.* An intelligent, automated birthday reminder system that transforms how you stay connected with the people who matter most.

**Mnemora** (from Latin *memor* - "mindful, remembering") is your personal birthday assistant that runs silently in the background, automatically checking your Google Calendar for birthdays and sending thoughtful notifications to your WhatsApp group, family chat, or any messaging platform you prefer. No more awkward "I didn't know it was your birthday!" moments.

## 🌟 Why Mnemora?

Imagine never forgetting a loved one's special day again. Mnemora does the heavy lifting for you:

- ✅ **Zero Manual Work** - Automatically syncs birthdays from Google Sheets to Calendar, then sends reminders
- ✅ **Smart Scheduling** - Daily birthday checks at 9 AM, plus a monthly digest on the 1st of every month
- ✅ **Multi-Platform** - Send notifications via WhatsApp, SMS, Email, or console - choose what works for you
- ✅ **Self-Healing** - Automatically recovers from missed days (if your server was down) without spamming
- ✅ **Production-Ready** - Deploy to AWS Lambda for a fully serverless setup (~$1/month)
- ✅ **Extensible Architecture** - Add new data sources or notification channels in minutes, not hours

## 🎯 What It Does

Every morning at 9 AM, Mnemora wakes up and:

1. **Checks for missed days** - If the system was down yesterday, it intelligently recovers without spamming
2. **Syncs data sources** - Automatically syncs birthdays from Google Sheets to Google Calendar (if configured)
3. **Finds today's birthdays** - Queries your Google Calendar for all birthdays happening today
4. **Sends notifications** - Posts personalized birthday messages to your WhatsApp group or other configured channels
5. **Monthly digest** - On the 1st of every month, sends a beautiful digest of all birthdays that month

The result? You always know when to celebrate, and your friends and family feel remembered. 🎉

## 🏗️ Technical Architecture

Mnemora is built with **extensibility and maintainability** at its core. Here's how it works under the hood:

### The Big Picture

```
┌─────────────────┐
│  Birthday       │
│  Orchestrator   │  ← Coordinates the entire workflow
└────────┬────────┘
         │
    ┌────┴─────────────────────────┐
    │                              │
┌───▼──────────────┐      ┌────────▼────────────┐
│  Data Sources    │      │  Output Channels    │
│  (Strategy)      │      │  (Strategy)         │
├──────────────────┤      ├─────────────────────┤
│ • Google Calendar│      │ • WhatsApp          │
│ • Google Sheets  │      │ • SMS (Twilio)      │
│ • [Your Source]  │      │ • Email             │
│                  │      │ • Console           │
└──────────────────┘      │ • [Your Channel]    │
                          └─────────────────────┘
```

### Core Design Principles

**1. Pluggable Architecture (Strategy Pattern)**

Mnemora uses a **Strategy Pattern** for both data sources and output channels. This means:

- **Data Sources** are interchangeable - whether you use Google Calendar, Google Sheets, a CSV file, or a database, they all implement the same `DataSource<T>` interface
- **Output Channels** are swappable - switch from WhatsApp to Telegram, Slack, or Discord by changing a single line of configuration
- Adding a new source or channel is as simple as implementing the interface and registering it with the factory

**2. Type-Safe Factory Pattern**

Instead of string-based type registration, Mnemora uses **explicit factory methods** for compile-time safety:

```typescript
// Type-safe - IDE autocomplete and compile-time checking
const calendar = DataSourceFactory.createCalendarDataSource(ctx);
const whatsapp = OutputChannelFactory.createWhatsAppOutputChannel(ctx);

// Not string-based like: create('calendar') ❌
```

**3. Dependency Injection via AppContext**

All services receive an `AppContext` object that provides:
- **Structured logging** (Pino) with JSON output for production
- **Metrics collection** (CloudWatch Metrics) for observability
- **Distributed tracing** (AWS X-Ray) for debugging
- **Configuration** centralized and environment-aware
- **Client instances** (S3, DynamoDB, Calendar, Sheets, WhatsApp) pre-configured

This makes the code testable, maintainable, and environment-aware (local vs. Lambda).

**4. Observability Built-In**

- **Structured Logging**: All operations are logged with correlation IDs for tracing requests across services
- **Metrics**: Tracks execution time, API calls, birthdays sent, failures, etc. - automatically published to CloudWatch
- **Alerting**: Sends SNS alerts for failures, quota warnings, authentication issues
- **Distributed Tracing**: X-Ray segments track each operation's performance

**5. Resilience & Recovery**

- **Missed Day Detection**: Tracks last execution date (stored in DynamoDB/S3), detects missed days on next run
- **Smart Recovery**: Only recovers the most recent missed 1st-of-month to avoid spamming multiple monthly digests
- **Graceful Degradation**: If one channel fails, others continue (though WhatsApp failures are currently fatal by design)
- **Error Handling**: Comprehensive error classification (auth errors, quota errors, network errors) with targeted alerts

### Data Flow Example

When Mnemora runs a birthday check:

```
1. BirthdayOrchestrator.runBirthdayCheck()
   │
   ├─→ LastRunTracker.getMissedDates()
   │   └─→ If missed 1st-of-month found, recover monthly digest
   │
   ├─→ BirthdayService.trySyncFromSheets()
   │   └─→ SheetsDataSource.read() → CalendarDataSource.write()
   │
   ├─→ BirthdayService.getTodaysBirthdaysWithOptionalDigest()
   │   ├─→ CalendarDataSource.read({ startDate: today, endDate: today })
   │   └─→ If 1st of month: CalendarDataSource.read({ startDate: startOfMonth, endDate: endOfMonth })
   │
   ├─→ Format messages (monthly digest or individual birthdays)
   │
   └─→ WhatsAppOutputChannel.send(message)
       └─→ WhatsApp client (Baileys) → WhatsApp Web API
```

### Key Technical Decisions

**Why TypeScript with ESM?**
- Type safety catches errors at compile time
- Explicit `.js` extensions in imports ensure correct module resolution
- Modern async/await patterns make the code readable

**Why Strategy Pattern?**
- Easy to add new data sources (CSV, database, REST API) without modifying existing code
- Simple to add new notification channels (Telegram, Discord, Slack)
- Perfect for testing - can mock any source or channel

**Why Serverless (Lambda)?**
- **Cost**: ~$1/month vs. $5-10/month for a 24/7 VPS
- **Reliability**: AWS handles infrastructure, scaling, and uptime
- **Simplicity**: No server management, automatic scaling, built-in monitoring

**Why WhatsApp Web Protocol (Baileys)?**
- No API costs (unlike official WhatsApp Business API)
- Works with personal WhatsApp accounts
- End-to-end encrypted, same security as official app
- Session persistence in S3 means no re-authentication needed

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and Yarn
- Google Cloud account with Calendar and Sheets APIs enabled
- WhatsApp account (for WhatsApp notifications)

### Installation

```bash
# Clone and install
git clone <repo-url>
cd mnemora
yarn install

# Configure environment
cp .env.example .env
# Edit .env with your credentials (see Setup section)
```

### Basic Usage

```bash
# Run once (check birthdays and send notifications)
yarn start

# Development mode (auto-reload on changes)
yarn dev

# Manual send (test notifications)
yarn manual-send
```

## 📖 Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Google API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Calendar API** and **Google Sheets API**
4. Create a **Service Account**:
   - Go to "IAM & Admin" → "Service Accounts"
   - Create service account, download JSON key
5. Share resources with service account:
   - **Calendar**: Share your calendar with the service account email (permissions: "See all event details")
   - **Sheets** (optional): Share your spreadsheet with the service account email (permissions: "Viewer" for read-only, "Editor" for sync)

### 3. Configure Environment Variables

Create a `.env` file:

```env
# Google Calendar (required)
GOOGLE_CALENDAR_ID=example@gmail.com
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id

# Google Sheets (optional - for syncing birthdays from spreadsheet)
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id

# WhatsApp (optional - for WhatsApp notifications)
# Set to the exact name of your WhatsApp group (e.g., "Family Chat")
WHATSAPP_GROUP_ID=your-whatsapp-group-name

# Twilio (optional - for SMS notifications only)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_SMS_NUMBER=+1234567890

# Configuration
SCHEDULE_TIME=09:00
TIMEZONE=America/Los_Angeles
```

### 4. First Run & WhatsApp Setup

On first run with WhatsApp configured:

```bash
yarn start
```

You'll see a QR code in the terminal. Open WhatsApp on your phone:
1. Go to Settings → Linked Devices
2. Tap "Link a Device"
3. Scan the QR code shown in the terminal

The session will be saved automatically (locally or to S3 if deployed to Lambda), so you won't need to scan again unless you log out.

## 💻 Usage

### Main Application

```bash
yarn start          # Run once (check birthdays and send notifications)
yarn dev            # Development mode with auto-reload
```

### CLI Scripts

Mnemora includes several utility scripts for managing birthdays:

```bash
# Query birthdays
yarn get-todays-birthdays              # Get today's birthdays
yarn get-monthly-digest                # Get monthly digest for current month
yarn get-todays-birthdays-with-digest  # Get both (if 1st of month, includes digest)
yarn get-all-birthdays                 # Read from Sheets, sync to Calendar, display all

# Management
yarn check-sync-status                 # Check sync status between Sheets and Calendar
yarn manual-send                       # Manually send monthly digest + today's birthdays

# WhatsApp-only
yarn send-monthly-digest-whatsapp      # Send monthly digest to WhatsApp group
```

### Local Scheduling (macOS)

For local development or personal use on macOS:

```bash
# Install (creates LaunchAgent for daily execution at 9 AM)
yarn install-cron

# Uninstall
yarn uninstall-cron
```

**Features:**
- Uses native macOS `launchd` (no external dependencies)
- Runs daily at 9 AM in your configured timezone
- Handles sleep/wake automatically - will run when system wakes if time was missed
- Prompts on login/bootup to manually send if needed
- Logs to `logs/` directory

## ☁️ AWS Lambda Deployment

Deploy Mnemora to AWS Lambda for a fully serverless, production-ready setup that costs approximately **$1/month**.

### Why Lambda?

- **Cost**: Pay only for execution time (~100ms/day = ~3 seconds/month = ~$0.01/month for compute)
- **Reliability**: 99.95% SLA, automatic retries, built-in monitoring
- **Scalability**: Handles any number of birthdays automatically
- **Zero Maintenance**: No servers to manage, patches, or updates

### Quick Deploy

```bash
# Build for Lambda
yarn build:lambda

# Deploy with AWS SAM
sam deploy --guided
```

### Infrastructure Components

The SAM template creates:

- **Lambda Function** - Executes birthday check daily
- **EventBridge Rule** - Triggers Lambda at 9 AM LA time (or your configured timezone)
- **S3 Bucket** - Stores WhatsApp session data (persists authentication)
- **DynamoDB Table** - Tracks last execution date (for missed day detection)
- **CloudWatch Logs** - Structured JSON logs with correlation IDs
- **CloudWatch Metrics** - Execution time, API calls, birthdays sent, failures
- **CloudWatch Alarms** - Alerts on failures, quota warnings, high execution time
- **SNS Topic** - Sends alerts via email/SMS when issues occur
- **X-Ray Tracing** - Distributed tracing for debugging

### Documentation

- **[docs/operations/DEPLOYMENT.md](./docs/operations/DEPLOYMENT.md)** - Complete deployment guide
- **[docs/operations/MONITORING.md](./docs/operations/MONITORING.md)** - Monitoring and alerting setup
- **[docs/operations/ALERTING_GUIDE.md](./docs/operations/ALERTING_GUIDE.md)** - Alert types and remediation
- **[docs/operations/SECURITY.md](./docs/operations/SECURITY.md)** - Security best practices

## 🔧 Development

```bash
yarn build          # Compile TypeScript
yarn type-check     # Type check without compiling
yarn lint           # Lint code (ESLint)
yarn lint:fix       # Auto-fix linting issues
yarn test           # Run tests (Vitest)
yarn test:run       # Run tests once (CI mode)
yarn test:coverage  # Run tests with coverage
```

### Adding a New Data Source

1. Create class extending `BaseDataSource<BirthdayRecord>`:
   ```typescript
   export class CSVDataSource extends BaseDataSource<BirthdayRecord> {
     async read(options?: ReadOptions): Promise<BirthdayRecord[]> {
       // Implement CSV reading logic
     }
     
     isAvailable(): boolean {
       // Check if CSV file exists
     }
     
     getMetadata(): DataSourceMetadata {
       return {
         name: 'CSV File',
         type: 'csv',
         description: 'Reads birthdays from CSV file',
         supportsRead: true,
         supportsWrite: false,
         capabilities: ['read']
       };
     }
   }
   ```

2. Add factory method to `DataSourceFactory`:
   ```typescript
   static createCSVDataSource(ctx: AppContext): CSVDataSource {
     return new CSVDataSource(ctx);
   }
   ```

That's it! The new data source is now available throughout the application.

### Adding a New Output Channel

1. Create class extending `BaseOutputChannel`:
   ```typescript
   export class TelegramOutputChannel extends BaseOutputChannel {
     async send(message: string, options?: SendOptions): Promise<SendResult> {
       // Implement Telegram sending logic
     }
     
     isAvailable(): boolean {
       // Check if Telegram bot token is configured
     }
   }
   ```

2. Add factory method to `OutputChannelFactory`:
   ```typescript
   static createTelegramOutputChannel(ctx: AppContext): TelegramOutputChannel {
     return new TelegramOutputChannel(ctx);
   }
   ```

The new channel is now ready to use!

## 📁 Project Structure

```
src/
├── data-source/          # Data source abstraction
│   ├── data-source.interface.ts    # DataSource<T> interface
│   ├── data-source.base.ts         # BaseDataSource<T> abstract class
│   ├── data-source.factory.ts      # Factory for creating data sources
│   └── implementations/
│       ├── calendar.source.ts      # Google Calendar implementation
│       └── sheets.source.ts        # Google Sheets implementation
│
├── output-channel/       # Output channel abstraction
│   ├── output-channel.interface.ts # OutputChannel interface
│   ├── output-channel.base.ts      # BaseOutputChannel abstract class
│   ├── output-channel.factory.ts   # Factory for creating output channels
│   └── implementations/
│       ├── console.channel.ts      # Console output (for testing)
│       └── whatsapp.channel.ts     # WhatsApp implementation (Baileys)
│
├── services/             # Business logic
│   ├── birthday.service.ts              # Core birthday operations
│   ├── birthday-orchestrator.service.ts # Main workflow orchestration
│   ├── monitoring.service.ts            # Execution tracking
│   ├── metrics.service.ts               # CloudWatch metrics
│   ├── alerting.service.ts              # SNS alerts
│   └── last-run-tracker.service.ts      # Missed day detection
│
├── clients/              # External API clients
│   ├── google-calendar.client.ts
│   ├── google-sheets.client.ts
│   ├── whatsapp.client.ts        # Baileys WhatsApp client
│   ├── s3.client.ts              # S3 for session storage
│   ├── cloudwatch.client.ts      # CloudWatch Metrics
│   └── xray.client.ts            # X-Ray tracing
│
├── scripts/              # CLI utilities
│   ├── get-todays-birthdays.ts
│   ├── get-monthly-digest.ts
│   ├── manual-send.ts
│   └── ...
│
├── utils/                # Shared utilities
│   ├── date-helpers.util.ts      # Date manipulation
│   ├── name-helpers.util.ts      # Name formatting
│   └── logger.util.ts            # Pino logger setup
│
├── app-context.ts        # Dependency injection container
├── config.ts             # Configuration loader
└── index.ts              # Main entry point
```

## 🛡️ Security

**Security safeguards are in place to prevent unauthorized operations:**

- **Deletion Protection**: All deletion operations are disabled by default to prevent accidental data loss
- **Production Protection**: Manual send scripts are blocked in production (`NODE_ENV=production`) to prevent spamming
- **Audit Logging**: All security-sensitive operations are logged with correlation IDs
- **Service Account Permissions**: Uses Google service accounts with minimal required permissions
- **Environment Variables**: Sensitive data stored in environment variables, never committed to code

See [docs/operations/SECURITY.md](./docs/operations/SECURITY.md) for detailed security information.

## 🐛 Troubleshooting

### Calendar Issues
- **403/401 Errors**: Ensure service account has calendar access (share calendar with service account email)
- **No events found**: Check that `GOOGLE_CALENDAR_ID` is correct and calendar has birthday events

### WhatsApp Issues
- **QR Code Not Appearing**: Check CloudWatch Logs (Lambda) or terminal output (local)
- **Session Expired**: Delete session files and re-authenticate (local: `auth_info/`, Lambda: S3 bucket)
- **Group Not Found**: Ensure `WHATSAPP_GROUP_ID` matches the **exact** group name (case-sensitive)
- **Connection Issues**: WhatsApp Web requires internet connection and phone to be online

### Timezone Issues
- Set `TIMEZONE` env var (defaults to `America/Los_Angeles`)
- Birthday events in Google Calendar should be "all-day" events for correct timezone handling

### Logging
- **Local**: Uses Pino with `pino-pretty` for readable output
- **Lambda**: Structured JSON logs in CloudWatch (use correlation IDs to trace requests)

## 📚 Documentation

### Technical Documentation
- **[docs/technical/ARCHITECTURE.md](./docs/technical/ARCHITECTURE.md)** - Detailed architecture, design patterns, data flow
- **[docs/technical/BUSINESS_FLOWS.md](./docs/technical/BUSINESS_FLOWS.md)** - Execution flows, error scenarios, edge cases
- **[docs/technical/CODE_ORGANIZATION.md](./docs/technical/CODE_ORGANIZATION.md)** - Code organization, style guide, best practices

### Operations Documentation
- **[docs/operations/DEPLOYMENT.md](./docs/operations/DEPLOYMENT.md)** - Complete AWS Lambda deployment guide
- **[docs/operations/MONITORING.md](./docs/operations/MONITORING.md)** - Monitoring, metrics, and alerting setup
- **[docs/operations/ALERTING_GUIDE.md](./docs/operations/ALERTING_GUIDE.md)** - Alert types, severity levels, remediation steps
- **[docs/operations/SECURITY.md](./docs/operations/SECURITY.md)** - Security safeguards and best practices
- **[docs/operations/PLAYBOOKS.md](./docs/operations/PLAYBOOKS.md)** - Quick reference playbooks for common operations

### Project Management
- **[docs/TODO.md](./docs/TODO.md)** - Roadmap, planned enhancements, feature ideas
- **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)** - How to contribute, code style, PR process

## 🤝 Contributing

**Pull requests, feedback, and ideas are all welcome!** 🎉

This project is open to improvements, suggestions, and new ideas. Whether you want to:
- Fix a bug
- Add a feature (new data source, output channel, etc.)
- Improve documentation
- Share feedback or ideas
- Discuss architecture decisions

See [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) for more details.

## 📄 License

ISC

---

**Made with ❤️ to help you never miss another birthday.**
