# Setting Up Contact Birthdays in Google Calendar

Google Calendar can automatically create birthday events from contacts that have birthdays set. Here's how to set it up:

## Step 1: Enable Birthdays Calendar

1. Go to [Google Calendar](https://calendar.google.com/)
2. Click the gear icon ⚙️ → **Settings**
3. Scroll down to **"Add calendar"** section
4. Look for **"Birthdays"** calendar
5. If it's not visible, click **"Browse calendars of interest"**
6. Find **"Birthdays"** and toggle it on
7. The Birthdays calendar should now appear in your calendar list

## Step 2: Add Birthdays to Contacts

1. Go to [Google Contacts](https://contacts.google.com/)
2. Open a contact
3. Click **"Edit"**
4. Scroll down to **"Birthday"** field
5. Enter the birthday date
6. Click **"Save"**

The birthday will automatically appear in your Google Calendar's "Birthdays" calendar.

## Step 3: Share Birthdays Calendar with Service Account

1. Go to [Google Calendar](https://calendar.google.com/)
2. On the left sidebar, find **"Birthdays"** calendar
3. Click the three dots (⋮) next to "Birthdays"
4. Click **"Settings and sharing"**
5. Scroll to **"Share with specific people"**
6. Click **"Add people"**
7. Enter the service account email: `calendar@mnemora-bot.iam.gserviceaccount.com`
8. Set permission to **"See all event details"**
9. Click **"Send"**

## Step 4: Update .env File

The Birthdays calendar has a special ID. You can find it by running:

```bash
npm run list-calendars
```

Look for the calendar with "Birthday" in the name, then update your `.env` file:

```env
GOOGLE_CALENDAR_ID=#contacts@group.v.calendar.google.com
```

Or if you want to use both calendars, we can update the code to check multiple calendars.

## Step 5: Test

Run the script to get all birthdays:

```bash
npm run get-all-birthdays
```

You should now see birthdays from your contacts!

## Notes

- The Birthdays calendar ID typically looks like: `#contacts@group.v.calendar.google.com`
- Contact birthdays are automatically recurring events
- The event title is usually just the contact's name or "Contact's Birthday"
- Make sure the Birthdays calendar is enabled and visible in your Google Calendar

