import calendarService from '../services/calendar.js';

/**
 * Test script to verify Google Calendar connection
 * Usage: npm run test-calendar
 */

async function testCalendar(): Promise<void> {
  try {
    console.log('Testing Google Calendar connection...\n');
    
    const today = new Date();
    console.log(`Fetching events for today: ${today.toLocaleDateString()}`);
    
    const events = await calendarService.getEventsForDate(today);
    
    console.log(`\n✅ Successfully connected to Google Calendar!`);
    console.log(`Found ${events.length} event(s) for today.\n`);
    
    if (events.length > 0) {
      console.log('Events found:');
      events.forEach((event, index) => {
        const start = event.start?.date || event.start?.dateTime;
        const summary = event.summary || '(No title)';
        const isBirthday = calendarService.isBirthdayEvent(event);
        
        console.log(`\n${index + 1}. ${summary}`);
        console.log(`   Date: ${start}`);
        console.log(`   Is Birthday: ${isBirthday ? '✅ Yes' : '❌ No'}`);
        if (isBirthday) {
          const name = calendarService.extractName(event);
          console.log(`   Name: ${name}`);
        }
      });
    } else {
      console.log('No events found for today.');
    }
    
    // Test monthly fetch
    console.log('\n\nTesting monthly fetch...');
    const monthEvents = await calendarService.getEventsForMonth(today);
    const birthdays = monthEvents.filter(event => calendarService.isBirthdayEvent(event));
    
    console.log(`Found ${monthEvents.length} total event(s) for this month.`);
    console.log(`Found ${birthdays.length} birthday event(s) for this month.`);
    
    if (birthdays.length > 0) {
      console.log('\nBirthdays this month:');
      birthdays.forEach((event, index) => {
        const start = event.start?.date || event.start?.dateTime;
        const name = calendarService.extractName(event);
        console.log(`  ${index + 1}. ${name} - ${start}`);
      });
    }
    
    console.log('\n✅ Calendar test completed successfully!');
  } catch (error) {
    console.error('\n❌ Error testing calendar:', error);
    if (error instanceof Error) {
      console.error('\nTroubleshooting:');
      console.error('1. Check that GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY are set in .env');
      console.error('2. Verify the service account email has access to your calendar');
      console.error('3. Make sure Google Calendar API is enabled in your Google Cloud project');
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testCalendar();

