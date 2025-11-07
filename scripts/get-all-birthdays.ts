import calendarService from '../services/calendar.js';

/**
 * Script to get all birthdays from Google Calendar
 * Usage: npm run get-all-birthdays
 */

async function getAllBirthdays(): Promise<void> {
  try {
    console.log('Fetching all birthdays from Google Calendar...\n');
    
    // Get events for the next year
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    
    const startOfRange = new Date(today);
    startOfRange.setHours(0, 0, 0, 0);
    
    const endOfRange = new Date(nextYear);
    endOfRange.setHours(23, 59, 59, 999);
    
    console.log(`Searching from ${startOfRange.toLocaleDateString()} to ${endOfRange.toLocaleDateString()}\n`);
    
    // Initialize calendar service
    await calendarService.initialize();
    
    // Try to find Birthdays calendar
    console.log('Looking for Birthdays calendar...');
    const birthdaysCalendarId = await calendarService.findBirthdaysCalendarId();
    
    let allEvents: any[] = [];
    
    if (birthdaysCalendarId) {
      console.log(`✅ Found Birthdays calendar: ${birthdaysCalendarId}`);
      console.log('Fetching events from Birthdays calendar...\n');
      // Fetch from Birthdays calendar
      const birthdaysEvents = await calendarService.getEventsForDateRange(startOfRange, endOfRange, birthdaysCalendarId);
      allEvents = birthdaysEvents;
      
      // Also fetch from primary calendar if different
      if (birthdaysCalendarId !== config.google.calendarId) {
        console.log('Also checking primary calendar...\n');
        const primaryEvents = await calendarService.getEventsForDateRange(startOfRange, endOfRange);
        allEvents = [...allEvents, ...primaryEvents];
      }
    } else {
      console.log('⚠️  Birthdays calendar not found. Checking primary calendar...\n');
      console.log('Make sure:');
      console.log('1. The Birthdays calendar is enabled in Google Calendar');
      console.log('2. The Birthdays calendar is shared with the service account');
      console.log('3. You have contacts with birthdays set in Google Contacts\n');
      
      // Fetch from primary calendar
      allEvents = await calendarService.getEventsForDateRange(startOfRange, endOfRange);
    }
    
    // Filter for birthdays - from Birthdays calendar, all recurring yearly events are birthdays
    const birthdays = allEvents.filter(event => {
      // If from Birthdays calendar, it's a birthday
      if (birthdaysCalendarId && event.organizer?.email === birthdaysCalendarId) {
        return true;
      }
      // Otherwise use the detection logic
      return calendarService.isBirthdayEvent(event) || 
             calendarService.isFromBirthdaysCalendar(event);
    });
    
    const allBirthdays: Array<{ event: any; date: Date; name: string }> = [];
    const seenBirthdays = new Set<string>(); // Track unique birthdays by name
    
    for (const event of birthdays) {
      const startDate = event.start?.date || event.start?.dateTime;
      if (!startDate) continue;
      
      const eventDate = new Date(startDate);
      const name = calendarService.extractName(event);
      
      // Create a unique key (name + month/day) to avoid duplicates from recurring events
      const uniqueKey = `${name}-${eventDate.getMonth()}-${eventDate.getDate()}`;
      
      if (!seenBirthdays.has(uniqueKey)) {
        seenBirthdays.add(uniqueKey);
        allBirthdays.push({
          event,
          date: eventDate,
          name
        });
      }
    }
    
    // Sort by date (ignoring year for recurring birthdays)
    allBirthdays.sort((a, b) => {
      const dateA = new Date(2024, a.date.getMonth(), a.date.getDate());
      const dateB = new Date(2024, b.date.getMonth(), b.date.getDate());
      return dateA.getTime() - dateB.getTime();
    });
    
    console.log(`\n✅ Found ${allBirthdays.length} unique birthday(s):\n`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (allBirthdays.length === 0) {
      console.log('No birthdays found in your calendar.');
      console.log('Make sure your calendar has birthday events with "birthday" in the title or description.');
    } else {
      // Group by month for better display
      const birthdaysByMonth: { [key: string]: Array<{ name: string; day: number }> } = {};
      
      allBirthdays.forEach(({ date, name }) => {
        const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const day = date.getDate();
        
        if (!birthdaysByMonth[monthKey]) {
          birthdaysByMonth[monthKey] = [];
        }
        
        birthdaysByMonth[monthKey].push({ name, day });
      });
      
      // Display by month
      Object.keys(birthdaysByMonth).sort().forEach(month => {
        console.log(`📅 ${month}:`);
        birthdaysByMonth[month].forEach(({ name, day }) => {
          console.log(`   ${day.toString().padStart(2, '0')} - ${name}`);
        });
        console.log('');
      });
      
      // Also show upcoming birthdays (next 30 days)
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('🎂 Upcoming Birthdays (next 30 days):');
      console.log('═══════════════════════════════════════════════════════\n');
      
      const upcoming = allBirthdays.filter(({ date }) => {
        const eventDate = new Date(2024, date.getMonth(), date.getDate());
        const todayDate = new Date(2024, today.getMonth(), today.getDate());
        const daysDiff = (eventDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff >= 0 && daysDiff <= 30;
      });
      
      if (upcoming.length === 0) {
        console.log('No birthdays in the next 30 days.');
      } else {
        upcoming.forEach(({ date, name }) => {
          const eventDate = new Date(2024, date.getMonth(), date.getDate());
          const todayDate = new Date(2024, today.getMonth(), today.getDate());
          const daysDiff = Math.ceil((eventDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
          
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (daysDiff === 0) {
            console.log(`   🎉 TODAY - ${name} (${dateStr})`);
          } else if (daysDiff === 1) {
            console.log(`   📅 Tomorrow - ${name} (${dateStr})`);
          } else {
            console.log(`   📅 In ${daysDiff} days - ${name} (${dateStr})`);
          }
        });
      }
    }
    
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('\n❌ Error fetching birthdays:', error);
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

getAllBirthdays();

