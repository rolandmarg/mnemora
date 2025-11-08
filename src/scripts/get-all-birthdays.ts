import birthdayService from '../services/birthday.js';
import calendarService from '../services/calendar.js';
import { extractNameFromEvent } from '../utils/name/name-helpers.js';
import { today, startOfYear, endOfYear, formatDateShort, parseDateFromString } from '../utils/date.js';

/**
 * Script to get all birthdays throughout the year
 */

interface BirthdaysByDate {
  [dateKey: string]: string[];
}

async function getAllBirthdays(): Promise<void> {
  try {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Getting all birthdays for the year...');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const todayDate = today();
    const yearStart = startOfYear(todayDate);
    const yearEnd = endOfYear(todayDate);
    
    console.log(`Fetching events from ${yearStart.getFullYear()}...`);
    
    // Fetch all events for the year
    const allEvents = await calendarService.getEventsForDateRange(yearStart, yearEnd);
    
    // Filter for birthday events
    const birthdayEvents = allEvents.filter(event => birthdayService.isBirthdayEvent(event));
    
    if (birthdayEvents.length === 0) {
      console.log(`\n📅 No birthdays found for ${yearStart.getFullYear()}.`);
      process.exit(0);
      return;
    }
    
    // Group birthdays by date
    const birthdaysByDate: BirthdaysByDate = {};
    
    for (const event of birthdayEvents) {
      const startDate = event.start?.date ?? event.start?.dateTime;
      if (!startDate) {
        continue;
      }
      
      try {
        const parsedDate = parseDateFromString(startDate);
        const dateKey = formatDateShort(parsedDate);
        
        if (!birthdaysByDate[dateKey]) {
          birthdaysByDate[dateKey] = [];
        }
        
        birthdaysByDate[dateKey].push(extractNameFromEvent(event));
      } catch {
        // Skip events with invalid dates
        continue;
      }
    }
    
    // Sort dates chronologically
    const sortedDates = Object.keys(birthdaysByDate).sort((a, b) => {
      try {
        const dateA = parseDateFromString(`${a}, ${yearStart.getFullYear()}`);
        const dateB = parseDateFromString(`${b}, ${yearStart.getFullYear()}`);
        return dateA.getTime() - dateB.getTime();
      } catch {
        return 0;
      }
    });
    
    // Display results
    console.log(`\n🎉 Found ${birthdayEvents.length} birthday(s) in ${yearStart.getFullYear()}:\n`);
    
    // Group by month for better readability
    const birthdaysByMonth: { [month: string]: { date: string; names: string[] }[] } = {};
    
    for (const date of sortedDates) {
      try {
        const parsedDate = parseDateFromString(`${date}, ${yearStart.getFullYear()}`);
        const monthName = parsedDate.toLocaleString('default', { month: 'long' });
        
        if (!birthdaysByMonth[monthName]) {
          birthdaysByMonth[monthName] = [];
        }
        
        birthdaysByMonth[monthName].push({
          date,
          names: birthdaysByDate[date],
        });
      } catch {
        // Skip invalid dates
        continue;
      }
    }
    
    // Display by month
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    for (const monthName of monthNames) {
      if (birthdaysByMonth[monthName]) {
        console.log(`\n📅 ${monthName}:`);
        for (const { date, names } of birthdaysByMonth[monthName]) {
          console.log(`   🎂 ${date}: ${names.join(', ')}`);
        }
      }
    }
    
    console.log('\n✅ Completed successfully!');
  } catch (error) {
    console.error('\n❌ Error getting all birthdays:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script
getAllBirthdays();

