# 🎂 Mnemora

Never miss another birthday. Mnemora automatically checks your Google Calendar or Google Sheets for birthdays and sends WhatsApp notifications to your group chat.

## The Problem

Birthdays are easy to forget. You might have them in a calendar or spreadsheet, but you still need to remember to check every day. Mnemora solves this by:
- **Automatically checking** your data sources (Google Calendar, Sheets, CSV) every morning
- **Sending notifications** to your WhatsApp group, family chat, or any messaging platform
- **Handling missed days** intelligently if the system was down
- **Monthly digests** on the 1st of each month showing all upcoming birthdays

No more awkward "I didn't know it was your birthday!" moments.

## Quick Start

```bash
yarn install
cp .env.example .env  # Edit with your credentials
yarn start
```

## Setup

### 1. Google Calendar/Sheets
- Create service account in [Google Cloud Console](https://console.cloud.google.com/)
- Enable Calendar API and/or Sheets API
- Download JSON key
- Share calendar/spreadsheet with service account email

### 2. Environment Variables

```env
# Google Calendar
GOOGLE_CALENDAR_ID=your-calendar-id
GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id

# Google Sheets (optional)
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id

# WhatsApp
WHATSAPP_GROUP_ID=your-group-name

# Config
SCHEDULE_TIME=09:00
TIMEZONE=America/Los_Angeles
```

### 3. First Run
```bash
yarn start
```
Scan QR code with WhatsApp (Settings → Linked Devices → Link a Device). Session saves automatically.

## Commands

```bash
yarn start              # Run birthday check
yarn dev                # Development mode (auto-reload)
yarn build              # Compile TypeScript
yarn type-check         # Type check
yarn lint               # Lint code
yarn test               # Run tests
yarn delete-all-events  # Bulk delete utility
```

## Local Scheduling (macOS)

```bash
yarn install-cron   # Install daily 9 AM job
yarn uninstall-cron # Remove
```

## AWS Lambda Deployment

```bash
yarn build:lambda
sam deploy --guided
```

**Cost**: ~$1/month. Creates Lambda, EventBridge, S3, DynamoDB, CloudWatch.

## Project Structure

```
src/
├── data-source/       # Google Calendar, Sheets, CSV, etc.
├── output-channel/    # WhatsApp, SMS, Email, Console
├── services/          # Birthday logic, orchestration
├── clients/           # API clients
├── scripts/           # CLI utilities
└── utils/             # Date, name, event helpers
```

## Development

- **TypeScript** with ESM (use `.js` extension in imports)
- **Yarn** package manager
- **Vitest** for testing
- **ESLint** for linting

See [docs/](./docs/) for detailed documentation.

## License

ISC
