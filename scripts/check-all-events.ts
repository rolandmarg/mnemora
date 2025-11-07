import calendarService from '../services/calendar.js';

/**
 * Script to check all events in the calendar to see what's there
 * This helps debug if birthdays are syncing but not being detected
 */

async function checkAllEvents(): Promise<void> {
  try {
    console.log('Checking all events in your calendar...\n');
    
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
    
    console.log(`Fetching events from ${startOfYear.toLocaleDateString()} to ${endOfYear.toLocaleDateString()}...\n`);
    
    const events = await calendarService.getEventsForDateRange(startOfYear, endOfYear);
    
    console.log(`✅ Found ${events.length} total event(s) in your calendar\n`);
    
    if (events.length === 0) {
      console.log('No events found. This could mean:');
      console.log('1. Your calendar is empty');
      console.log('2. The service account doesn\'t have access to events');
      console.log('3. There are no events in the date range\n');
      return;
    }
    
    // Group events by type
    const recurringEvents: any[] = [];
    const allDayEvents: any[] = [];
    const birthdayEvents: any[] = [];
    const otherEvents: any[] = [];
    
    events.forEach(event => {
      const isRecurring = !!event.recurrence && event.recurrence.length > 0;
      const isAllDay = event.start?.date && !event.start?.dateTime;
      const isBirthday = calendarService.isBirthdayEvent(event);
      
      if (isBirthday) {
        birthdayEvents.push(event);
      } else if (isRecurring) {
        recurringEvents.push(event);
      } else if (isAllDay) {
        allDayEvents.push(event);
      } else {
        otherEvents.push(event);
      }
    });
    
    // Display birthday events
    if (birthdayEvents.length > 0) {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`🎂 BIRTHDAY EVENTS (${birthdayEvents.length}):`);
      console.log('═══════════════════════════════════════════════════════\n');
      birthdayEvents.forEach((event, index) => {
        const summary = event.summary || '(No title)';
        const start = event.start?.date || event.start?.dateTime || '(No date)';
        const recurrence = event.recurrence ? 'Recurring' : 'One-time';
        const name = calendarService.extractName(event);
        console.log(`${index + 1}. ${summary}`);
        console.log(`   Date: ${start}`);
        console.log(`   Type: ${recurrence}`);
        console.log(`   Extracted Name: ${name}`);
        console.log('');
      });
    } else {
      console.log('⚠️  No birthday events detected\n');
    }
    
    // Display recurring events (might be birthdays we're missing)
    if (recurringEvents.length > 0) {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`🔄 RECURRING EVENTS (${recurringEvents.length}):`);
      console.log('═══════════════════════════════════════════════════════\n');
      recurringEvents.slice(0, 10).forEach((event, index) => {
        const summary = event.summary || '(No title)';
        const start = event.start?.date || event.start?.dateTime || '(No date)';
        const recurrence = event.recurrence?.[0] || 'Unknown';
        const isAllDay = event.start?.date && !event.start?.dateTime;
        console.log(`${index + 1}. ${summary}`);
        console.log(`   Date: ${start}`);
        console.log(`   Recurrence: ${recurrence.substring(0, 50)}...`);
        console.log(`   All-day: ${isAllDay ? 'Yes' : 'No'}`);
        console.log(`   Detected as birthday: ${calendarService.isBirthdayEvent(event) ? '✅ Yes' : '❌ No'}`);
        console.log('');
      });
      if (recurringEvents.length > 10) {
        console.log(`   ... and ${recurringEvents.length - 10} more recurring events\n`);
      }
    }
    
    // Display all-day events (might be birthdays)
    if (allDayEvents.length > 0 && allDayEvents.length < 50) {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`📅 ALL-DAY EVENTS (${allDayEvents.length}):`);
      console.log('═══════════════════════════════════════════════════════\n');
      allDayEvents.slice(0, 10).forEach((event, index) => {
        const summary = event.summary || '(No title)';
        const start = event.start?.date || event.start?.dateTime || '(No date)';
        const isRecurring = !!event.recurrence && event.recurrence.length > 0;
        console.log(`${index + 1}. ${summary}`);
        console.log(`   Date: ${start}`);
        console.log(`   Recurring: ${isRecurring ? 'Yes' : 'No'}`);
        console.log(`   Detected as birthday: ${calendarService.isBirthdayEvent(event) ? '✅ Yes' : '❌ No'}`);
        console.log('');
      });
      if (allDayEvents.length > 10) {
        console.log(`   ... and ${allDayEvents.length - 10} more all-day events\n`);
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 SUMMARY:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total events: ${events.length}`);
    console.log(`Birthday events: ${birthdayEvents.length}`);
    console.log(`Recurring events: ${recurringEvents.length}`);
    console.log(`All-day events: ${allDayEvents.length}`);
    console.log(`Other events: ${otherEvents.length}\n`);
    
    if (birthdayEvents.length === 0 && recurringEvents.length > 0) {
      console.log('💡 TIP: You have recurring events but none detected as birthdays.');
      console.log('   This might mean:');
      console.log('   1. Contact birthdays haven\'t synced to your calendar yet');
      console.log('   2. The recurrence pattern doesn\'t match birthday detection');
      console.log('   3. Birthdays need to be enabled in Google Calendar settings\n');
    }
    
    console.log('✅ Done!');
  } catch (error) {
    console.error('\n❌ Error checking events:', error);
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkAllEvents();

