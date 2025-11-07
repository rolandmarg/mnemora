import { google } from 'googleapis';
import { config } from '../config.js';

/**
 * Check calendar permissions and access
 */

async function checkPermissions(): Promise<void> {
  try {
    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    const calendar = google.calendar({ version: 'v3', auth });

    console.log('Checking calendar permissions...\n');
    console.log(`Calendar ID: ${config.google.calendarId}\n`);

    // Try to get calendar info
    try {
      const calendarInfo = await calendar.calendars.get({
        calendarId: config.google.calendarId,
      });
      
      console.log('✅ Calendar access successful!');
      console.log(`   Name: ${calendarInfo.data.summary || '(no name)'}`);
      console.log(`   Timezone: ${calendarInfo.data.timeZone || '(not set)'}`);
      console.log(`   Description: ${calendarInfo.data.description || '(no description)'}\n`);
    } catch (error) {
      console.log('❌ Cannot access calendar');
      if (error instanceof Error) {
        console.log(`   Error: ${error.message}\n`);
        if (error.message.includes('404')) {
          console.log('💡 Calendar not found. Possible causes:');
          console.log('   1. Calendar ID is incorrect');
          console.log('   2. Calendar is not shared with service account');
          console.log(`   3. Service account: ${config.google.clientEmail}\n`);
        } else if (error.message.includes('403')) {
          console.log('💡 Permission denied. Possible causes:');
          console.log('   1. Calendar is not shared with service account');
          console.log('   2. Service account needs "See all event details" permission');
          console.log(`   3. Service account: ${config.google.clientEmail}\n`);
        }
      }
      return;
    }

    // Try to list events
    console.log('Testing event access...\n');
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear(), 11, 31, 23, 59, 59);

    try {
      const events = await calendar.events.list({
        calendarId: config.google.calendarId,
        timeMin: startOfYear.toISOString(),
        timeMax: endOfYear.toISOString(),
        maxResults: 1,
        singleEvents: true,
      });

      console.log('✅ Event access successful!');
      console.log(`   Can read events: Yes`);
      console.log(`   Total events in range: ${events.data.items?.length || 0}\n`);
      
      if ((events.data.items?.length || 0) === 0) {
        console.log('⚠️  No events found. This could mean:');
        console.log('   1. Calendar is empty');
        console.log('   2. No events in the date range');
        console.log('   3. Events exist but are in a different time range\n');
      }
    } catch (error) {
      console.log('❌ Cannot read events');
      if (error instanceof Error) {
        console.log(`   Error: ${error.message}\n`);
      }
    }

    // Try to list calendars
    console.log('Checking calendar list access...\n');
    try {
      const calendarList = await calendar.calendarList.list();
      console.log(`✅ Can list calendars: Yes`);
      console.log(`   Found ${calendarList.data.items?.length || 0} calendar(s)\n`);
      
      if ((calendarList.data.items?.length || 0) === 0) {
        console.log('⚠️  No calendars in list. This means:');
        console.log('   The service account can only access calendars explicitly shared with it');
        console.log(`   Service account: ${config.google.clientEmail}\n`);
        console.log('💡 To fix: Share your calendar with the service account');
        console.log('   1. Go to Google Calendar');
        console.log('   2. Settings → Settings for my calendars');
        console.log('   3. Select your calendar');
        console.log('   4. Share with specific people');
        console.log(`   5. Add: ${config.google.clientEmail}`);
        console.log('   6. Permission: "See all event details"\n');
      }
    } catch (error) {
      console.log('❌ Cannot list calendars');
      if (error instanceof Error) {
        console.log(`   Error: ${error.message}\n`);
      }
    }

    console.log('✅ Permission check complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkPermissions();

