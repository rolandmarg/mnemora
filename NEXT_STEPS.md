# Next Steps - Mnemora Birthday Bot

## Step 1: Set Up Google Calendar API ✅ (Do this first)

### 1.1 Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it (e.g., "mnemora-birthday-bot")
4. Click "Create"

### 1.2 Enable Google Calendar API
1. In the project, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

### 1.3 Create Service Account
1. Go to "IAM & Admin" → "Service Accounts"
2. Click "Create Service Account"
3. Name it (e.g., "mnemora-calendar-reader")
4. Click "Create and Continue"
5. Skip role assignment (click "Continue")
6. Click "Done"

### 1.4 Create Service Account Key
1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON"
5. Download the JSON file (save it securely, don't commit it!)

### 1.5 Share Calendar with Service Account
1. Open [Google Calendar](https://calendar.google.com/)
2. Click the gear icon → "Settings"
3. Click "Settings for my calendars" → Select your calendar
4. Scroll to "Share with specific people"
5. Click "Add people"
6. Enter the service account email (from the JSON file, looks like: `xxx@xxx.iam.gserviceaccount.com`)
7. Set permission to "See all event details"
8. Click "Send"

**What you'll need from the JSON file:**
- `client_email` → `GOOGLE_CLIENT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY`
- `project_id` → `GOOGLE_PROJECT_ID`

---

## Step 2: Set Up WhatsApp and Get Group ID

### 2.1 Create .env File
```bash
cp .env.example .env
```

### 2.2 Find Your WhatsApp Group ID
1. Run the helper script:
   ```bash
   npm run find-group
   ```
2. A QR code will appear - scan it with WhatsApp on your phone
3. The script will list all your groups with their IDs
4. Copy the ID (the number part, without `@g.us`)

### 2.3 Configure .env File
Open `.env` and fill in:
- Google Calendar credentials (from Step 1)
- WhatsApp Group ID (from Step 2.2)
- Schedule time (default: `09:00`)

**Example .env:**
```env
GOOGLE_CALENDAR_ID=primary
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id
WHATSAPP_GROUP_ID=120363123456789012
SCHEDULE_TIME=09:00
```

---

## Step 3: Test the Bot Locally

### 3.1 Test Calendar Connection
Create a test script to verify Google Calendar access:
```bash
# We can create a test script to verify calendar access
```

### 3.2 Run the Bot in Development Mode
```bash
npm run dev
```

This will:
- Initialize WhatsApp (scan QR code if first time)
- Run an initial check immediately
- Schedule daily checks at the configured time

### 3.3 Verify It Works
- Check that WhatsApp messages are sent
- Verify calendar events are being read correctly
- Test with a test birthday event in your calendar

---

## Step 4: Improve Error Handling & Logging

### 4.1 Add Better Logging
- Add structured logging (consider `winston` or `pino`)
- Log all operations with timestamps
- Add error tracking

### 4.2 Add Retry Logic
- Retry failed WhatsApp messages
- Handle calendar API rate limits
- Add exponential backoff

### 4.3 Add Health Checks
- Monitor bot status
- Alert if bot stops working
- Add uptime monitoring

---

## Step 5: Deployment Options

### Option A: Run on Your Computer (24/7)
- Use `pm2` or `forever` to keep it running
- Set up auto-restart on reboot

### Option B: Deploy to Cloud
- **Heroku**: Easy deployment, free tier available
- **Railway**: Simple deployment, good free tier
- **DigitalOcean App Platform**: Simple and affordable
- **AWS Lambda**: Serverless (requires refactoring for scheduled events)
- **Google Cloud Run**: Good for containerized apps

### Option C: Use a VPS
- DigitalOcean Droplet
- Linode
- Vultr

---

## Step 6: Enhancements (Future)

### 6.1 Add More Features
- [ ] Support multiple WhatsApp groups
- [ ] Custom birthday messages per person
- [ ] Remind a few days before birthdays
- [ ] Support multiple calendars
- [ ] Add webhook support for manual triggers
- [ ] Add admin dashboard

### 6.2 Improve Birthday Detection
- [ ] Better name extraction from calendar events
- [ ] Support different birthday event formats
- [ ] Handle timezone issues
- [ ] Support all-day events better

### 6.3 Add Tests
- [ ] Unit tests for services
- [ ] Integration tests
- [ ] E2E tests

### 6.4 Add Monitoring
- [ ] Error tracking (Sentry)
- [ ] Metrics (Prometheus/Grafana)
- [ ] Alerts when bot fails

---

## Current Status Checklist

- [ ] Google Calendar API set up
- [ ] Service account created and key downloaded
- [ ] Calendar shared with service account
- [ ] .env file created
- [ ] Google credentials added to .env
- [ ] WhatsApp group ID found
- [ ] WhatsApp group ID added to .env
- [ ] Bot tested locally
- [ ] Bot running successfully
- [ ] Deployment method chosen
- [ ] Bot deployed (if applicable)

---

## Quick Start Commands

```bash
# 1. Install dependencies (already done)
npm install

# 2. Create .env file
cp .env.example .env
# Edit .env with your credentials

# 3. Find WhatsApp group ID
npm run find-group

# 4. Test in development mode
npm run dev

# 5. Build for production
npm run build

# 6. Run in production
npm start
```

---

## Need Help?

- Check the README.md for detailed setup instructions
- Review error logs in the console
- Verify all environment variables are set correctly
- Ensure calendar is shared with service account

