# How to Enable Birthdays Calendar

If "Birthdays" is not in "Browse calendars of interest", try these methods:

## Method 1: Check if Birthdays Calendar Already Exists

The Birthdays calendar might already be in your calendar list:

1. Go to [Google Calendar](https://calendar.google.com/)
2. Look at the **left sidebar** under "My calendars"
3. Check if **"Birthdays"** is already listed there
4. If it is, make sure it's **checked/enabled** (the checkbox should be checked)

## Method 2: Enable via Calendar Settings

1. Go to [Google Calendar](https://calendar.google.com/)
2. Click the **gear icon** ⚙️ → **Settings**
3. In the left sidebar, scroll down to **"Add calendar"**
4. Look for **"Birthdays"** in the list
5. If you see it, click the **toggle** to enable it

## Method 3: Check Google Contacts Settings

Birthdays calendar is created from Google Contacts:

1. Go to [Google Contacts](https://contacts.google.com/)
2. Make sure you have contacts with birthdays set:
   - Open a contact
   - Check if they have a birthday field filled in
   - If not, click "Edit" → add birthday → "Save"
3. The Birthdays calendar should appear automatically once you have contacts with birthdays

## Method 4: Direct Calendar URL

Sometimes the Birthdays calendar needs to be added directly:

1. Go to [Google Calendar](https://calendar.google.com/)
2. In the left sidebar, click the **"+"** next to "Other calendars"
3. Click **"From URL"**
4. Try adding: `https://calendar.google.com/calendar/embed?src=#contacts@group.v.calendar.google.com`
5. Or search for "Birthdays" in the calendar search

## Method 5: Check Calendar Visibility

1. Go to [Google Calendar](https://calendar.google.com/)
2. Click the **gear icon** ⚙️ → **Settings**
3. Scroll down to **"View options"**
4. Make sure **"Show declined events"** and other visibility options are enabled
5. Check if Birthdays calendar appears in the calendar list

## If Birthdays Calendar Still Doesn't Appear

The Birthdays calendar might not be available if:
- You don't have any contacts with birthdays set
- Your Google account doesn't have Contacts enabled
- The feature is not available in your region/account type

## Alternative: Create Birthday Events Manually

If the Birthdays calendar isn't available, you can:
1. Manually create birthday events in your main calendar
2. Title them: "Contact's Birthday" or "Contact's Birthday"
3. Make them recurring yearly events
4. The bot will detect them automatically

## Verify Birthdays Are Syncing

After enabling the Birthdays calendar:

1. Check your main calendar - you should see birthday events
2. They'll appear as recurring yearly events
3. The title will be the contact's name or "Contact's Birthday"
4. Run `npm run check-all-events` to see if they appear in the API

