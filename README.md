# Mnemora

A TypeScript bot that manages birthdays across multiple data sources (Google Calendar, Google Sheets) and sends notifications through multiple output channels (Console, SMS, WhatsApp, Email).

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
- Twilio account (optional, for SMS/WhatsApp)

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
GOOGLE_CALENDAR_ID=primary
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id

# Google Sheets (optional)
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id

# Twilio (optional)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
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

```bash
yarn get-todays-birthdays                    # Get today's birthdays
yarn get-monthly-digest                      # Get monthly digest
yarn get-todays-birthdays-with-digest        # Get today's birthdays + monthly digest (if 1st)
yarn get-all-birthdays                       # Read from Sheets, sync to Calendar, display all
yarn delete-events --all                     # Delete all birthday events
yarn delete-events --all --date-range "2024-01-01" "2024-12-31"  # Delete in date range
```

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

## Project Structure

```
src/
├── base/              # Abstract base classes
├── channels/          # Output channels (Console, SMS, WhatsApp, Email)
├── clients/           # External API clients (Google Calendar, Google Sheets)
├── factories/         # Factory classes for creating instances
├── interfaces/        # TypeScript interfaces
├── scripts/           # CLI scripts
├── services/          # Business logic (BirthdayService)
├── sources/           # Data sources (Calendar, Sheets)
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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

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
- **Timezone Issues**: Set `TIMEZONE` env var (defaults to `America/Los_Angeles`)
- **Logging**: Uses structured JSON logging with `pino`. Use `pino-pretty` for development

## License

ISC
