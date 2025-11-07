import calendarService from '../services/calendar.js';
import { isRecurring, isAllDay, getEventStartDate, groupEvents } from '../utils/calendar/event-helpers.js';
import { today, startOfYear, endOfYear, formatDateRange } from '../utils/date.js';

/**
 * Script to check all events in the calendar to see what's there
 * This helps debug if birthdays are syncing but not being detected
 */

async function checkAllEvents(): Promise<void> {
  try {
    console.log('Checking all events in your calendar...\n');
    
    const todayDate = today();
    const yearStart = startOfYear(todayDate);
    const yearEnd = endOfYear(todayDate);
    
    console.log(`Fetching events from ${formatDateRange(yearStart, yearEnd)}...\n`);
    
    const events = await calendarService.getEventsForDateRange(yearStart, yearEnd);
    
    console.log(`✅ Found ${events.length} total event(s) in your calendar\n`);
    
    if (events.length === 0) {
      console.log('No events found. This could mean:');
      console.log('1. Your calendar is empty');
      console.log('2. The service account doesn\'t have access to events');
      console.log('3. There are no events in the date range\n');
      return;
    }
    
    // Group events by type
    const groups = groupEvents(events, [
      { name: 'birthday', test: (e) => calendarService.isBirthdayEvent(e) },
      { name: 'recurring', test: isRecurring },
      { name: 'allDay', test: isAllDay },
    ]);
    
    const birthdayEvents = groups.birthday ?? [];
    const recurringEvents = groups.recurring ?? [];
    const allDayEvents = groups.allDay ?? [];
    const otherEvents = groups.other ?? [];
    
    // Display birthday events
    if (birthdayEvents.length > 0) {
      console.log('═══════════════════════════════════════════════════════');
      console.log(`🎂 BIRTHDAY EVENTS (${birthdayEvents.length}):`);
      console.log('═══════════════════════════════════════════════════════\n');
      birthdayEvents.forEach((event, index) => {
        console.log(`${index + 1}. ${event.summary ?? '(No title)'}`);
        console.log(`   Date: ${getEventStartDate(event)}`);
        console.log(`   Type: ${isRecurring(event) ? 'Recurring' : 'One-time'}`);
        console.log(`   Extracted Name: ${calendarService.extractName(event)}`);
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
        console.log(`${index + 1}. ${event.summary ?? '(No title)'}`);
        console.log(`   Date: ${getEventStartDate(event)}`);
        console.log(`   Recurrence: ${event.recurrence?.[0]?.substring(0, 50) ?? 'Unknown'}...`);
        console.log(`   All-day: ${isAllDay(event) ? 'Yes' : 'No'}`);
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
        console.log(`${index + 1}. ${event.summary ?? '(No title)'}`);
        console.log(`   Date: ${getEventStartDate(event)}`);
        console.log(`   Recurring: ${isRecurring(event) ? 'Yes' : 'No'}`);
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

