# Troubleshooting: No Calendars Found

If `npm run list-calendars` shows "No calendars found", follow these steps:

## Step 1: Verify Service Account Email

First, check what service account email you're using:

```bash
grep GOOGLE_CLIENT_EMAIL .env
```

You should see something like:
```
GOOGLE_CLIENT_EMAIL=calendar@mnemora-bot.iam.gserviceaccount.com
```

**Note this email** - you'll need it for sharing calendars.

## Step 2: Share Your Calendars

The service account needs explicit access to your calendars. Here's how to share them:

### Share Primary Calendar

1. Go to [Google Calendar](https://calendar.google.com/)
2. Click the **gear icon** ⚙️ → **Settings**
3. In the left sidebar, click **"Settings for my calendars"**
4. Click on your **primary calendar** (usually your email address)
5. Scroll down to **"Share with specific people"**
6. Click **"Add people"**
7. Enter your service account email: `calendar@mnemora-bot.iam.gserviceaccount.com`
8. Set permission to **"See all event details"** (or "Make changes to events" if needed)
9. Click **"Send"**

### Share Birthdays Calendar

1. In Google Calendar, look at the left sidebar
2. Find **"Birthdays"** calendar (if it's not visible, see Step 3)
3. Click the **three dots** (⋮) next to "Birthdays"
4. Click **"Settings and sharing"**
5. Scroll to **"Share with specific people"**
6. Click **"Add people"**
7. Enter: `calendar@mnemora-bot.iam.gserviceaccount.com`
8. Set permission to **"See all event details"**
9. Click **"Send"**

### Share Other Calendars

Repeat the same process for any other calendars you want the bot to access.

## Step 3: Enable Birthdays Calendar (if needed)

If you don't see the "Birthdays" calendar:

1. Go to [Google Calendar](https://calendar.google.com/)
2. Click the **gear icon** ⚙️ → **Settings**
3. In the left sidebar, find **"Add calendar"**
4. Click **"Browse calendars of interest"**
5. Find **"Birthdays"** in the list
6. Toggle it **ON**
7. The Birthdays calendar should now appear in your calendar list

## Step 4: Verify Sharing

After sharing, verify the calendars are accessible:

```bash
npm run list-calendars
```

You should now see your calendars listed.

## Step 5: Check Calendar IDs

Once calendars are listed, note their IDs. The output will look like:

```
1. My Calendar ← CURRENT
   ID: your-email@gmail.com
   Access: owner

2. Birthdays
   ID: #contacts@group.v.calendar.google.com
   Access: reader
```

You can update your `.env` file to use a specific calendar:

```env
GOOGLE_CALENDAR_ID=#contacts@group.v.calendar.google.com
```

## Common Issues

### Issue: "No calendars found" after sharing

**Possible causes:**
1. **Wrong service account email** - Double-check the email in `.env` matches what you shared with
2. **Permission level too low** - Make sure it's at least "See all event details"
3. **Calendar not saved** - Make sure you clicked "Send" after adding the service account

**Solution:**
- Run `npm run sanity-check` to verify credentials
- Double-check the service account email in Google Calendar sharing settings
- Try sharing again with "Make changes to events" permission

### Issue: "403 Forbidden" error

**Possible causes:**
1. Google Calendar API not enabled
2. Service account lacks necessary permissions

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to **"APIs & Services"** → **"Library"**
4. Search for **"Google Calendar API"**
5. Make sure it's **enabled**

### Issue: Birthdays calendar not showing

**Possible causes:**
1. Birthdays calendar not enabled
2. No contacts have birthdays set
3. Calendar not shared with service account

**Solution:**
1. Enable Birthdays calendar (see Step 3 above)
2. Add birthdays to contacts in [Google Contacts](https://contacts.google.com/)
3. Share Birthdays calendar with service account (see Step 2)

## Quick Diagnostic Commands

```bash
# Check if credentials are set
grep GOOGLE_CLIENT_EMAIL .env

# Run full sanity check
npm run sanity-check

# List calendars
npm run list-calendars

# Test calendar access
npm run test-calendar
```

## Still Not Working?

If calendars still don't appear after sharing:

1. **Wait a few minutes** - Sometimes it takes a moment for permissions to propagate
2. **Check Google Cloud Console** - Verify the service account exists and is active
3. **Verify API is enabled** - Make sure Google Calendar API is enabled in your project
4. **Check error messages** - Run `npm run sanity-check` for detailed error information
5. **Try re-sharing** - Remove and re-add the service account to the calendar

## Service Account Email Reference

Your service account email is:
```
calendar@mnemora-bot.iam.gserviceaccount.com
```

Use this exact email when sharing calendars.

