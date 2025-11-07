# Setup Checklist

## ✅ Completed Steps

- [x] WhatsApp group ID configured: `120363406100622625`
- [x] Google Calendar API credentials configured
- [x] Calendar connection test successful

## 🔍 Next Steps

### 1. Verify Calendar Sharing (IMPORTANT!)

Make sure your Google Calendar is shared with the service account:

1. Go to [Google Calendar](https://calendar.google.com/)
2. Click the gear icon ⚙️ → **Settings**
3. Click **"Settings for my calendars"** → Select your calendar
4. Scroll to **"Share with specific people"**
5. Check if this email is listed: `calendar@mnemora-bot.iam.gserviceaccount.com`
   - If NOT listed, click **"Add people"**
   - Enter: `calendar@mnemora-bot.iam.gserviceaccount.com`
   - Set permission to **"See all event details"**
   - Click **"Send"**

### 2. Test with a Birthday Event

To verify everything works, add a test birthday event:

1. Go to Google Calendar
2. Create a new event
3. Title it: `Test Person's Birthday` (or any name)
4. Set it to **today's date** (or tomorrow for testing)
5. Make it an **all-day event**
6. Optionally add "birthday" in the description
7. Save the event

### 3. Test the Bot

Run the bot in development mode:

```bash
npm run dev
```

This will:
- Initialize WhatsApp (if not already done)
- Run an immediate check for today's birthdays
- Schedule daily checks at 9am

### 4. Verify WhatsApp Message

If you added a test birthday event for today, the bot should:
- Detect the birthday event
- Send a message to your WhatsApp group
- Show the message: `🎉 Happy Birthday Test Person! 🎂🎈`

## 🎯 Quick Test Commands

```bash
# Test calendar connection
npm run test-calendar

# Test full bot (development mode)
npm run dev

# Build for production
npm run build

# Run in production mode
npm start
```

## 📝 Notes

- The bot runs daily at 9am (configurable via `SCHEDULE_TIME` in `.env`)
- On the 1st of each month, it sends a digest of all upcoming birthdays
- Make sure your calendar has birthday events with "birthday" in the title or description

