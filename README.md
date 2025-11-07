# Mnemora

A bot that fetches Google Calendar birthdays and sends WhatsApp notifications.

## Features

- 🎂 Daily birthday checks at 9am (configurable)
- 📅 Monthly birthday digest on the 1st of each month
- 📱 WhatsApp group notifications
- 📆 Google Calendar integration

## Prerequisites

- Node.js (v18 or higher)
- TypeScript (installed as dev dependency)
- Google Calendar API credentials
- WhatsApp account (for WhatsApp Web)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Google Calendar API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**
4. Create a **Service Account**:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Give it a name and create
   - Click on the service account > "Keys" tab
   - Click "Add Key" > "Create new key" > Choose JSON
   - Download the JSON file
5. Share your calendar with the service account:
   - Open Google Calendar
   - Go to Settings > "Share with specific people"
   - Add the service account email (from the JSON file) with "See all event details" permission

### 3. WhatsApp Setup

1. The bot uses WhatsApp Web.js which requires scanning a QR code
2. On first run, a QR code will be displayed in the terminal
3. Scan it with your WhatsApp mobile app

### 4. Get WhatsApp Group ID

1. Run the helper script:
   ```bash
   npm run find-group
   ```
2. This will display all your WhatsApp groups with their IDs
3. Copy the ID (without `@g.us`) to your `.env` file

### 5. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Google Calendar API Configuration
GOOGLE_CALENDAR_ID=primary
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id

# WhatsApp Configuration
WHATSAPP_GROUP_ID=your-group-id

# Scheduler Configuration (24-hour format)
SCHEDULE_TIME=09:00
```

**Note**: For `GOOGLE_PRIVATE_KEY`, copy the entire private key from your JSON file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Keep the `\n` characters as they are.

## Usage

### Build TypeScript

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Start the Bot

```bash
npm start
```

This runs the compiled JavaScript from `dist/`.

### Development Mode (with auto-reload)

```bash
npm run dev
```

This runs TypeScript directly with `tsx` and watches for changes.

### Type Checking

```bash
npm run type-check
```

This checks TypeScript types without compiling.

## How It Works

1. **Daily Check (9am)**: The bot checks Google Calendar for birthdays today and sends congratulations messages to the WhatsApp group.

2. **Monthly Digest (1st of month)**: On the first day of each month, the bot sends a digest of all upcoming birthdays for that month.

## Project Structure

```
mnemora/
├── services/
│   ├── calendar.ts      # Google Calendar integration
│   ├── whatsapp.ts      # WhatsApp messaging
│   └── birthday.ts      # Birthday logic
├── scripts/
│   └── find-group-id.ts # Helper script to find WhatsApp group IDs
├── types/
│   └── qrcode-terminal.d.ts  # Type definitions
├── config.ts            # Configuration loader
├── index.ts             # Main entry point with scheduler
├── tsconfig.json        # TypeScript configuration
├── dist/                # Compiled JavaScript (generated)
├── .env                 # Environment variables (create this)
├── .env.example         # Example environment variables
└── package.json
```

## Troubleshooting

### Google Calendar Issues

- Ensure the service account has access to your calendar
- Check that the calendar ID is correct (use "primary" for your main calendar)
- Verify the private key is correctly formatted in `.env`

### WhatsApp Issues

- Make sure you scan the QR code when it appears
- The QR code expires after a few minutes - restart the bot if needed
- Ensure your WhatsApp account is active and connected

### Group ID Issues

- Group IDs are in the format: `120363123456789012@g.us`
- You can find group IDs by using WhatsApp Web.js methods or checking the browser console in WhatsApp Web

## License

ISC

