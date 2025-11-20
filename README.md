# Mnemora

A TypeScript bot that manages birthdays across multiple data sources (Google Calendar, Google Sheets) and sends notifications through multiple output channels (Console, SMS, WhatsApp, Email).

## ⚠️ Disclaimer

**This project was primarily developed with the assistance of AI (Claude/Cursor AI).** While the code has been reviewed and tested, please be aware that:

- Most of the codebase was generated or significantly assisted by AI models
- The architecture and implementation decisions were made in collaboration with AI assistance
- Code quality and patterns follow AI-generated conventions
- Manual review and testing have been performed, but the codebase may contain AI-generated patterns or approaches

## Features

- 🎂 Daily birthday checks
- 📅 Monthly digest on the 1st of each month
- 📆 Multi-source support (Google Calendar, Google Sheets)
- 📱 Multi-channel notifications (Console, SMS, WhatsApp, Email)
- 🔄 Data synchronization (Sheets → Calendar)

## Prerequisites

- Node.js (v18+)
- Yarn
- Google Calendar API credentials
- Google Sheets API credentials (optional)
- WhatsApp account (for WhatsApp notifications via whatsapp-web.js)
- Twilio account (optional, for SMS only)

## Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Google API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Calendar API** and **Google Sheets API**
3. Create a **Service Account** and download JSON key
4. Share your calendar with the service account email (See all event details)
5. Share your Google Sheet with the service account email (Viewer/Editor)

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Google Calendar
GOOGLE_CALENDAR_ID=example@gmail.com
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id

# Google Sheets (optional)
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id

# WhatsApp (optional - uses whatsapp-web.js)
# Set to the name of your WhatsApp group (e.g., "Bday bot testing")
WHATSAPP_GROUP_ID=your-whatsapp-group-name

# Twilio (optional, for SMS only)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_SMS_NUMBER=+1234567890

# Configuration
SCHEDULE_TIME=09:00
TIMEZONE=America/Los_Angeles
```

## Usage

### Main Application

```bash
yarn start          # Run once
yarn dev            # Development mode with auto-reload
```

### CLI Scripts

#### Delete All Events ⚠️ DESTRUCTIVE

**⚠️ WARNING: This will delete ALL events from your Google Calendar! This cannot be undone!**

Use this script only if you need to completely clear your calendar:

```bash
# Dry run - shows what would be deleted (safe, no changes)
yarn delete-all-events

# Actually delete ALL events (requires confirmation)
yarn delete-all-events --confirm
```

**Use Cases:**
- Starting fresh with a clean calendar
- Removing all events before re-syncing from Sheets
- Complete calendar reset

**Safety Features:**
- Dry-run mode by default
- Requires explicit `--confirm` flag
- Shows breakdown of birthday vs other events
- Progress indicator during deletion
- Detailed logging of all operations

```bash
yarn get-todays-birthdays                    # Get today's birthdays
yarn get-monthly-digest                      # Get monthly digest
yarn get-todays-birthdays-with-digest        # Get today's birthdays + monthly digest (if 1st)
yarn get-all-birthdays                       # Read from Sheets, sync to Calendar, display all
yarn delete-events --all                     # Delete all birthday events
yarn delete-events --all --date-range "2024-01-01" "2024-12-31"  # Delete in date range
yarn manual-send                             # Manually send monthly digest + today's birthdays
yarn send-monthly-digest-whatsapp            # Send monthly digest to WhatsApp group
yarn delete-all-events                        # Find all events (dry run) ⚠️
yarn delete-all-events --confirm              # Delete ALL events ⚠️ DESTRUCTIVE
```

### Local Scheduling Setup (macOS)

For local development/prototyping, you can set up native macOS launchd agents to run the birthday check daily at 9:00 AM Los Angeles time, and prompt for manual sending on bootup. Uses only built-in macOS tools - no external dependencies!

#### Installation

```bash
yarn install-cron
```

This will:
- Install a LaunchAgent that runs daily at 9:00 AM Los Angeles time
- Install a LaunchAgent that prompts you to send messages on login/bootup
- Create log files in `logs/` directory

**Note:** On first run, WhatsApp will display a QR code in the terminal. Scan it with your WhatsApp mobile app to authenticate. The session will be saved for future use.

#### Uninstallation

```bash
yarn uninstall-cron
```

This removes the cron job and LaunchAgent.

#### Manual Send

You can manually trigger sending messages at any time:

```bash
yarn manual-send
```

This will always send:
- Monthly digest (regardless of current date)
- Today's birthday messages (if any)

#### Notes

- **Native macOS**: Uses launchd (built into macOS) - no external dependencies like cron or node-cron
- **Timezone Support**: Native timezone support - runs at 9:00 AM Los Angeles time automatically
- **Energy Efficient**: Wakes up only when scheduled, no 24/7 daemon
- **Sleep/Wake Handling**: Automatically handles laptop sleep/wake - will run when system wakes up if time was missed
- **Logs**: Check `logs/cron-YYYY-MM-DD.log` for daily execution logs
- **Bootup Prompt**: On login, you'll get a terminal prompt asking if you want to send messages now
- **Missed Days Recovery**: If the service was down (laptop shut down, cloud outage), it will automatically detect missed days and send messages for the most recent missed day on the next run. This prevents spamming with multiple days of messages.

### Development

```bash
yarn build          # Compile TypeScript
yarn type-check     # Type check without compiling
yarn lint           # Lint code
yarn lint:fix       # Auto-fix linting issues
yarn test           # Run tests
yarn test:run       # Run tests once
yarn test:coverage  # Run tests with coverage
```

## AWS Lambda Deployment

Mnemora can be deployed to AWS Lambda for serverless execution. The deployment includes:

- **Lambda Function**: Runs daily birthday checks
- **EventBridge Rule**: Schedules daily execution at 9 AM LA time
- **S3 Bucket**: Stores WhatsApp session data
- **DynamoDB Table**: Tracks execution history
- **CloudWatch**: Logs, metrics, and alarms
- **X-Ray**: Distributed tracing

### Quick Start

1. **Build the application**:
   ```bash
   yarn build:lambda
   ```

2. **Deploy with SAM**:
   ```bash
   sam deploy --guided
   ```

3. **Set up WhatsApp authentication** (first run):
   - Check CloudWatch Logs for QR code
   - Scan with WhatsApp mobile app
   - Session saved to S3 automatically

### Documentation

- **[docs/operations/DEPLOYMENT.md](./docs/operations/DEPLOYMENT.md)** - Complete deployment guide
- **[docs/operations/MONITORING.md](./docs/operations/MONITORING.md)** - Monitoring and alerting setup
- **[docs/operations/MIGRATION_GUIDE.md](./docs/operations/MIGRATION_GUIDE.md)** - WhatsApp Cloud API migration

### Features

- ✅ **Automatic scheduling** via EventBridge
- ✅ **Session persistence** in S3 (no re-authentication needed)
- ✅ **CloudWatch metrics** for monitoring
- ✅ **CloudWatch alarms** for alerting
- ✅ **X-Ray tracing** for debugging
- ✅ **Cost-effective** (~$1/month)

### Environment Variables for Lambda

The following environment variables are automatically configured by the SAM template:

- `GOOGLE_CALENDAR_ID` - Google Calendar ID
- `GOOGLE_CLIENT_EMAIL` - Service account email
- `GOOGLE_PRIVATE_KEY` - Service account private key
- `GOOGLE_PROJECT_ID` - Google Cloud project ID
- `WHATSAPP_GROUP_ID` - WhatsApp group name or ID
- `AWS_S3_BUCKET` - S3 bucket for session storage
- `AWS_DYNAMO_TABLE` - DynamoDB table for execution tracking
- `AWS_CLOUDWATCH_LOG_GROUP` - CloudWatch log group name

See [docs/operations/DEPLOYMENT.md](./docs/operations/DEPLOYMENT.md) for detailed setup instructions.

## Project Structure

```
src/
├── data-source/       # Data source abstraction and implementations
│   └── implementations/  # Data sources (Calendar, Sheets)
├── output-channel/    # Output channel abstraction and implementations
│   └── implementations/  # Output channels (Console, SMS, WhatsApp, Email)
├── clients/           # External API clients (Google Calendar, Google Sheets)
├── scripts/           # CLI scripts
├── services/          # Business logic (BirthdayService)
├── utils/             # Utility functions
├── config.ts          # Configuration loader
└── index.ts           # Main entry point
```

## Architecture

Mnemora uses a **pluggable architecture** with clear separation:

- **Data Sources**: Abstract interface for reading/writing birthday data
- **Output Channels**: Abstract interface for sending notifications
- **Factories**: Create instances of data sources and output channels
- **Services**: Business logic that orchestrates data sources and output channels

See [docs/technical/ARCHITECTURE.md](./docs/technical/ARCHITECTURE.md) for details.

## Future Improvements

See [docs/TODO.md](./docs/TODO.md) for planned enhancements including:
- Enhanced logging and message persistence
- Event-driven architecture migration
- Multi-group support
- Advanced analytics
- And more...

## Documentation

### Technical Documentation
- **[docs/technical/ARCHITECTURE.md](./docs/technical/ARCHITECTURE.md)** - System architecture and design patterns
- **[docs/technical/BUSINESS_FLOWS.md](./docs/technical/BUSINESS_FLOWS.md)** - Complete execution flows and error scenarios
- **[docs/technical/CODE_ORGANIZATION.md](./docs/technical/CODE_ORGANIZATION.md)** - Code organization and style guide

### Operations Documentation
- **[docs/operations/DEPLOYMENT.md](./docs/operations/DEPLOYMENT.md)** - AWS Lambda deployment guide
- **[docs/operations/MONITORING.md](./docs/operations/MONITORING.md)** - Monitoring and alerting setup
- **[docs/operations/ALERTING_GUIDE.md](./docs/operations/ALERTING_GUIDE.md)** - Alert types, severity levels, and remediation
- **[docs/operations/SECURITY.md](./docs/operations/SECURITY.md)** - Security safeguards and best practices
- **[docs/operations/PLAYBOOKS.md](./docs/operations/PLAYBOOKS.md)** - AWS deployment playbooks and quick reference
- **[docs/operations/MIGRATION_GUIDE.md](./docs/operations/MIGRATION_GUIDE.md)** - WhatsApp Cloud API migration

### Project Management
- **[docs/TODO.md](./docs/TODO.md)** - Future improvements and roadmap
- **[docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)** - How to contribute to the project
- **[docs/bugs-fixes/README.md](./docs/bugs-fixes/README.md)** - Bug fixes and resolutions
- **[docs/bugs-fixes/README.md](./docs/bugs-fixes/README.md)** - Bug fixes and resolutions

## Extending

### Adding a New Data Source

1. Create class extending `BaseDataSource<BirthdayRecord>`
2. Implement `DataSource` interface
3. Add type to `DataSourceFactory`

### Adding a New Output Channel

1. Create class extending `BaseOutputChannel`
2. Implement `OutputChannel` interface
3. Add type to `OutputChannelFactory`

## Troubleshooting

- **Calendar Issues**: Ensure service account has calendar access, check calendar ID
- **Sheets Issues**: Ensure service account has sheet access, check spreadsheet ID
- **WhatsApp Issues**: 
  - First time: Scan QR code displayed in terminal with WhatsApp mobile app
  - Session saved: Check `.wwebjs_auth/` directory for saved session
  - Group not found: Ensure `WHATSAPP_GROUP_ID` matches exact group name
  - Connection issues: WhatsApp Web requires internet connection and phone to be online
- **Timezone Issues**: Set `TIMEZONE` env var (defaults to `America/Los_Angeles`)
- **Logging**: Uses structured JSON logging with `pino`. Use `pino-pretty` for development

## Security

**Security safeguards are in place to prevent unauthorized operations:**

- **Deletion is disabled**: All deletion operations are completely disabled to prevent unauthorized deletion of birthday events
- **Production protection**: Manual send scripts are blocked in production (`NODE_ENV=production`) to prevent spamming
- **Audit logging**: All security-sensitive operations are logged for monitoring

See [docs/operations/SECURITY.md](./docs/operations/SECURITY.md) for detailed security information.

### Environment Variables

- `NODE_ENV` - Set to `production` to enable production mode (blocks manual scripts)
  - Development: `NODE_ENV=development` or unset (allows manual scripts)
  - Production: `NODE_ENV=production` (blocks manual scripts, main check still works)

## Contributing

**Pull requests, feedback, and opinions are all welcome!** 🎉

This project is open to improvements, suggestions, and new ideas. Whether you want to:
- Fix a bug
- Add a feature
- Improve documentation
- Share feedback or ideas
- Discuss architecture decisions

We'd love to hear from you! See [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) for more details.

## License

ISC
