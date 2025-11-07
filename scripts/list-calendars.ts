import { google } from 'googleapis';
import { config } from '../config.js';

/**
 * Script to list all calendars available to the service account
 * Usage: npm run list-calendars
 */

async function listCalendars(): Promise<void> {
  try {
    if (!config.google.clientEmail || !config.google.privateKey) {
      throw new Error('Google Calendar credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env');
    }

    const auth = new google.auth.JWT(
      config.google.clientEmail,
      undefined,
      config.google.privateKey,
      ['https://www.googleapis.com/auth/calendar.readonly']
    );

    const calendar = google.calendar({ version: 'v3', auth });

    console.log('Fetching calendars...\n');
    
    const response = await calendar.calendarList.list();
    const calendars = response.data.items || [];

    console.log(`Found ${calendars.length} calendar(s):\n`);
    console.log('═══════════════════════════════════════════════════════\n');

    calendars.forEach((cal, index) => {
      const id = cal.id || '(no id)';
      const summary = cal.summary || '(no name)';
      const accessRole = cal.accessRole || 'unknown';
      const backgroundColor = cal.backgroundColor || '';
      const selected = cal.id === config.google.calendarId ? ' ← CURRENT' : '';
      
      console.log(`${index + 1}. ${summary}${selected}`);
      console.log(`   ID: ${id}`);
      console.log(`   Access: ${accessRole}`);
      if (backgroundColor) {
        console.log(`   Color: ${backgroundColor}`);
      }
      console.log('');
    });

    // Check for Birthdays calendar specifically
    const birthdaysCalendar = calendars.find(cal => 
      cal.summary?.toLowerCase().includes('birthday') ||
      cal.id?.toLowerCase().includes('birthday')
    );

    if (birthdaysCalendar) {
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('🎂 BIRTHDAYS CALENDAR FOUND!');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`Name: ${birthdaysCalendar.summary}`);
      console.log(`ID: ${birthdaysCalendar.id}`);
      console.log(`\nTo use this calendar, update your .env file:`);
      console.log(`GOOGLE_CALENDAR_ID="${birthdaysCalendar.id}"`);
      console.log('\nOr share it with the service account if not already shared.');
    } else {
      console.log('\n⚠️  No "Birthdays" calendar found.');
      console.log('Make sure:');
      console.log('1. You have contacts with birthdays set in Google Contacts');
      console.log('2. The "Birthdays" calendar is enabled in Google Calendar settings');
      console.log('3. The calendar is shared with the service account');
    }

    console.log('\n✅ Done!');
  } catch (error) {
    console.error('\n❌ Error listing calendars:', error);
    if (error instanceof Error) {
      console.error('\nTroubleshooting:');
      console.error('1. Check that GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY are set in .env');
      console.error('2. Verify the service account has calendar access');
      console.error('3. Make sure Google Calendar API is enabled');
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

listCalendars();

