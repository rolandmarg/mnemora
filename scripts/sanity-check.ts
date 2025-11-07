import { google } from 'googleapis';
import { config } from '../config.js';

/**
 * Comprehensive sanity check for Google Calendar API and service account
 * Usage: npm run sanity-check
 */

async function sanityCheck(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 Google Calendar API & Service Account Sanity Check');
  console.log('═══════════════════════════════════════════════════════\n');

  let allChecksPassed = true;

  // Check 1: Environment variables
  console.log('1️⃣  Checking environment variables...');
  if (!config.google.clientEmail) {
    console.log('   ❌ GOOGLE_CLIENT_EMAIL is not set');
    allChecksPassed = false;
  } else {
    console.log(`   ✅ GOOGLE_CLIENT_EMAIL: ${config.google.clientEmail}`);
  }

  if (!config.google.privateKey) {
    console.log('   ❌ GOOGLE_PRIVATE_KEY is not set');
    allChecksPassed = false;
  } else {
    const keyPreview = config.google.privateKey.substring(0, 30) + '...';
    console.log(`   ✅ GOOGLE_PRIVATE_KEY: ${keyPreview}`);
  }

  if (!config.google.projectId) {
    console.log('   ⚠️  GOOGLE_PROJECT_ID is not set (optional)');
  } else {
    console.log(`   ✅ GOOGLE_PROJECT_ID: ${config.google.projectId}`);
  }

  console.log(`   ✅ GOOGLE_CALENDAR_ID: ${config.google.calendarId}\n`);

  if (!allChecksPassed) {
    console.log('❌ Environment variables check failed. Please set required variables in .env\n');
    process.exit(1);
  }

  // Check 2: Authentication
  console.log('2️⃣  Testing authentication...');
  try {
    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    // Try to get access token
    const token = await auth.getAccessToken();
    if (token) {
      console.log('   ✅ Authentication successful');
      const tokenStr = typeof token === 'string' ? token : String(token);
      console.log(`   ✅ Access token obtained: ${tokenStr.substring(0, 20)}...`);
    } else {
      console.log('   ❌ Failed to get access token');
      allChecksPassed = false;
    }
  } catch (error) {
    console.log('   ❌ Authentication failed');
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
    }
    allChecksPassed = false;
  }
  console.log('');

  if (!allChecksPassed) {
    console.log('❌ Authentication check failed. Please verify your credentials.\n');
    process.exit(1);
  }

  // Check 3: API access
  console.log('3️⃣  Testing Google Calendar API access...');
  try {
    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    const calendar = google.calendar({ version: 'v3', auth });

    // Try to list calendars (this tests API access)
    const calendarList = await calendar.calendarList.list();
    console.log('   ✅ Google Calendar API is accessible');
    console.log(`   ✅ Found ${calendarList.data.items?.length || 0} calendar(s) accessible to service account`);
    
    if ((calendarList.data.items?.length || 0) === 0) {
      console.log('   ⚠️  No calendars found - you may need to share calendars with the service account');
      console.log(`   📧 Service account email: ${config.google.clientEmail}`);
    }
  } catch (error) {
    console.log('   ❌ Google Calendar API access failed');
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
      
      // Check for specific error types
      if (error.message.includes('403')) {
        console.log('   💡 This might mean:');
        console.log('      - Google Calendar API is not enabled in your project');
        console.log('      - Service account lacks necessary permissions');
      } else if (error.message.includes('401')) {
        console.log('   💡 This might mean:');
        console.log('      - Invalid credentials');
        console.log('      - Service account key is incorrect');
      }
    }
    allChecksPassed = false;
  }
  console.log('');

  // Check 4: Calendar access
  console.log('4️⃣  Testing calendar access...');
  try {
    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    const calendar = google.calendar({ version: 'v3', auth });

    // Try to get calendar metadata
    const calendarInfo = await calendar.calendars.get({
      calendarId: config.google.calendarId,
    });

    console.log(`   ✅ Successfully accessed calendar: ${config.google.calendarId}`);
    console.log(`   ✅ Calendar name: ${calendarInfo.data.summary || '(no name)'}`);
    console.log(`   ✅ Calendar timezone: ${calendarInfo.data.timeZone || '(not set)'}`);
  } catch (error) {
    console.log(`   ❌ Failed to access calendar: ${config.google.calendarId}`);
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
      
      if (error.message.includes('404')) {
        console.log('   💡 This might mean:');
        console.log('      - Calendar ID is incorrect');
        console.log('      - Calendar is not shared with the service account');
        console.log(`      - Service account email: ${config.google.clientEmail}`);
      } else if (error.message.includes('403')) {
        console.log('   💡 This might mean:');
        console.log('      - Calendar is not shared with the service account');
        console.log('      - Service account lacks "See all event details" permission');
        console.log(`      - Service account email: ${config.google.clientEmail}`);
      }
    }
    allChecksPassed = false;
  }
  console.log('');

  // Check 5: Event reading
  console.log('5️⃣  Testing event reading...');
  try {
    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    const calendar = google.calendar({ version: 'v3', auth });

    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await calendar.events.list({
      calendarId: config.google.calendarId,
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const eventCount = events.data.items?.length || 0;
    console.log(`   ✅ Successfully read events from calendar`);
    console.log(`   ✅ Found ${eventCount} event(s) for today`);
    
    if (eventCount > 0) {
      console.log('   📅 Sample events:');
      events.data.items?.slice(0, 3).forEach((event, index) => {
        const summary = event.summary || '(No title)';
        const start = event.start?.date || event.start?.dateTime || '(No date)';
        console.log(`      ${index + 1}. ${summary} - ${start}`);
      });
    }
  } catch (error) {
    console.log('   ❌ Failed to read events');
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}`);
    }
    allChecksPassed = false;
  }
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  if (allChecksPassed) {
    console.log('✅ All sanity checks passed!');
    console.log('✅ Service account and API are working correctly');
  } else {
    console.log('❌ Some checks failed');
    console.log('⚠️  Please review the errors above and fix them');
  }
  console.log('═══════════════════════════════════════════════════════\n');

  process.exit(allChecksPassed ? 0 : 1);
}

sanityCheck();

