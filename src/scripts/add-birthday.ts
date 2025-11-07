import { calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { createQuestionInterface, askQuestion, askConfirmation } from '../utils/cli.js';
import { startOfDay, endOfDay, formatDateISO } from '../utils/date.js';
import { createReadWriteCalendarClient } from '../utils/calendar-auth.js';

/**
 * Script to add birthday events to Google Calendar
 * Usage: npm run add-birthday
 * Or: npm run add-birthday "John Doe" "1990-05-15"
 */

interface BirthdayInput {
  firstName: string;
  lastName?: string;
  birthday: Date;
  year?: number;
}

function parseInput(input: string): BirthdayInput | null {
  // Try different formats:
  // 1. "John Doe 1990-05-15"
  // 2. "John Doe May 15, 1990"
  // 3. "John 1990-05-15"
  // 4. "John Doe 05-15"
  // 5. "John 05-15"
  
  const trimmed = input.trim();
  
  // Try ISO date format: YYYY-MM-DD or MM-DD
  const isoDateMatch = trimmed.match(/^(.+?)\s+(\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (isoDateMatch) {
    const namePart = isoDateMatch[1].trim();
    const year = isoDateMatch[2] ? parseInt(isoDateMatch[2].replace('-', '')) : undefined;
    const month = parseInt(isoDateMatch[3]);
    const day = parseInt(isoDateMatch[4]);
    
    const nameParts = namePart.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
    
    const birthday = new Date();
    if (year) {
      birthday.setFullYear(year, month - 1, day);
    } else {
      birthday.setMonth(month - 1, day);
    }
    
    return { firstName, lastName, birthday, year };
  }
  
  // Try date format: "Name Month DD, YYYY" or "Name Month DD"
  const dateMatch = trimmed.match(/^(.+?)\s+([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (dateMatch) {
    const namePart = dateMatch[1].trim();
    const monthName = dateMatch[2];
    const day = parseInt(dateMatch[3]);
    const year = dateMatch[4] ? parseInt(dateMatch[4]) : undefined;
    
    const nameParts = namePart.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
    
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                        'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIndex = monthNames.findIndex(m => m.startsWith(monthName.toLowerCase()));
    
    if (monthIndex === -1) {
      return null;
    }
    
    const birthday = new Date();
    if (year) {
      birthday.setFullYear(year, monthIndex, day);
    } else {
      birthday.setMonth(monthIndex, day);
    }
    
    return { firstName, lastName, birthday, year };
  }
  
  return null;
}


async function checkForDuplicates(
  calendar: calendar_v3.Calendar,
  birthday: BirthdayInput
): Promise<calendar_v3.Schema$Event[]> {
  const fullName = birthday.lastName 
    ? `${birthday.firstName} ${birthday.lastName}`
    : birthday.firstName;
  
  // Check for events on the same date
  const eventDate = new Date(birthday.birthday);
  const start = startOfDay(eventDate);
  const end = endOfDay(eventDate);
  
  try {
    const response = await calendar.events.list({
      calendarId: config.google.calendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items || [];
    
    // Filter for potential duplicates: same date and similar name
    const duplicates = events.filter(event => {
      const eventSummary = (event.summary || '').toLowerCase();
      const firstNameLower = birthday.firstName.toLowerCase();
      const lastNameLower = birthday.lastName?.toLowerCase() || '';
      const fullNameLower = fullName.toLowerCase();
      
      // Check if event is a birthday and name matches
      const isBirthday = eventSummary.includes('birthday');
      const nameMatches = 
        eventSummary.includes(firstNameLower) ||
        eventSummary.includes(fullNameLower) ||
        (lastNameLower && eventSummary.includes(lastNameLower));
      
      return isBirthday && nameMatches;
    });
    
    return duplicates;
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    return [];
  }
}

async function addBirthdayToCalendar(birthday: BirthdayInput, skipDuplicateCheck: boolean = false): Promise<void> {
  const calendar = createReadWriteCalendarClient();
  
  // Check for duplicates before adding
  if (!skipDuplicateCheck) {
    const duplicates = await checkForDuplicates(calendar, birthday);
    
    if (duplicates.length > 0) {
      const fullName = birthday.lastName 
        ? `${birthday.firstName} ${birthday.lastName}`
        : birthday.firstName;
      
      console.log('\n⚠️  Potential duplicate(s) found:');
      duplicates.forEach((dup, index) => {
        console.log(`   ${index + 1}. ${dup.summary || '(No title)'}`);
        console.log(`      Event ID: ${dup.id}`);
        console.log(`      Date: ${dup.start?.date || dup.start?.dateTime || '(No date)'}`);
      });
      
      console.log(`\n   Trying to add: ${fullName}'s Birthday`);
      console.log(`   Date: ${new Date(birthday.birthday).toLocaleDateString()}\n`);
      
      return; // Don't add, let user decide
    }
  }

  // Create event title
  const fullName = birthday.lastName 
    ? `${birthday.firstName} ${birthday.lastName}`
    : birthday.firstName;
  const eventTitle = `${fullName}'s Birthday`;

  // Create event date (all-day event)
  const dateString = formatDateISO(new Date(birthday.birthday));

  // Create recurring event (yearly)
  const recurrence = ['RRULE:FREQ=YEARLY;INTERVAL=1'];

  const event: calendar_v3.Schema$Event = {
    summary: eventTitle,
    description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
    start: {
      date: dateString,
      timeZone: 'UTC',
    },
    end: {
      date: dateString,
      timeZone: 'UTC',
    },
    recurrence: recurrence,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 }, // 1 day before
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: config.google.calendarId,
      requestBody: event,
    });

    console.log('\n✅ Birthday event created successfully!');
    console.log(`   Title: ${eventTitle}`);
    console.log(`   Date: ${dateString}`);
    console.log(`   Event ID: ${response.data.id}`);
    console.log(`   Calendar: ${config.google.calendarId}`);
  } catch (error) {
    console.error('\n❌ Error creating birthday event:', error);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    throw error;
  }
}


async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Check for --force flag
  const forceFlag = args.includes('--force') || args.includes('-f');
  const filteredArgs = args.filter(arg => arg !== '--force' && arg !== '-f');
  
  if (filteredArgs.length > 0) {
    // Command line mode: parse arguments
    const input = filteredArgs.join(' ');
    const birthday = parseInput(input);
    
    if (!birthday) {
      console.error('❌ Could not parse input. Please use format:');
      console.error('   "Name LastName YYYY-MM-DD"');
      console.error('   "Name LastName MM-DD"');
      console.error('   "Name LastName Month DD, YYYY"');
      console.error('   "Name LastName Month DD"');
      process.exit(1);
    }
    
    try {
      const calendar = createReadWriteCalendarClient();
      const duplicates = await checkForDuplicates(calendar, birthday);
      
      if (duplicates.length > 0 && !forceFlag) {
        const fullName = birthday.lastName 
          ? `${birthday.firstName} ${birthday.lastName}`
          : birthday.firstName;
        
        console.log('\n⚠️  Potential duplicate(s) found:');
        duplicates.forEach((dup, index) => {
          console.log(`   ${index + 1}. ${dup.summary || '(No title)'}`);
          console.log(`      Event ID: ${dup.id}`);
          console.log(`      Date: ${dup.start?.date || dup.start?.dateTime || '(No date)'}`);
        });
        
        console.log(`\n   Trying to add: ${fullName}'s Birthday`);
        console.log(`   Date: ${new Date(birthday.birthday).toLocaleDateString()}\n`);
        console.log('❌ Duplicate detected. Use --force flag to add anyway:');
        console.log(`   npm run add-birthday "${input}" --force\n`);
        process.exit(1);
      }
      
      await addBirthdayToCalendar(birthday, forceFlag);
      process.exit(0);
    } catch (error) {
      process.exit(1);
    }
  } else {
    // Interactive mode
    const rl = createQuestionInterface();
    
    try {
      console.log('═══════════════════════════════════════════════════════');
      console.log('📅 Add Birthday to Calendar');
      console.log('═══════════════════════════════════════════════════════\n');
      
      const firstName = await askQuestion(rl, 'First name: ');
      if (!firstName) {
        console.error('❌ First name is required');
        rl.close();
        process.exit(1);
      }
      
      const lastNameInput = await askQuestion(rl, 'Last name (optional, press Enter to skip): ');
      const lastName = lastNameInput || undefined;
      
      const birthdayInput = await askQuestion(rl, 'Birthday (YYYY-MM-DD, MM-DD, or "Month DD, YYYY"): ');
      const birthday = parseInput(`${firstName} ${lastName || ''} ${birthdayInput}`.trim());
      
      if (!birthday) {
        console.error('\n❌ Could not parse birthday. Please use format:');
        console.error('   YYYY-MM-DD (e.g., 1990-05-15)');
        console.error('   MM-DD (e.g., 05-15)');
        console.error('   Month DD, YYYY (e.g., May 15, 1990)');
        console.error('   Month DD (e.g., May 15)');
        rl.close();
        process.exit(1);
      }
      
      // Override with actual input
      birthday.firstName = firstName;
      birthday.lastName = lastName;
      
      // Check for duplicates
      const calendar = createReadWriteCalendarClient();
      const duplicates = await checkForDuplicates(calendar, birthday);
      
      if (duplicates.length > 0) {
        const fullName = birthday.lastName 
          ? `${birthday.firstName} ${birthday.lastName}`
          : birthday.firstName;
        
        console.log('\n⚠️  Potential duplicate(s) found:');
        duplicates.forEach((dup, index) => {
          console.log(`   ${index + 1}. ${dup.summary || '(No title)'}`);
          console.log(`      Event ID: ${dup.id}`);
          console.log(`      Date: ${dup.start?.date || dup.start?.dateTime || '(No date)'}`);
        });
        
        console.log(`\n   Trying to add: ${fullName}'s Birthday`);
        console.log(`   Date: ${new Date(birthday.birthday).toLocaleDateString()}\n`);
        
        const confirm = await askConfirmation(rl, 'Add anyway? (y/n): ');
        rl.close();
        
        if (!confirm) {
          console.log('❌ Cancelled. Birthday not added.');
          process.exit(0);
        }
      } else {
        rl.close();
      }
      
      await addBirthdayToCalendar(birthday, duplicates.length > 0);
      process.exit(0);
    } catch (error) {
      rl.close();
      process.exit(1);
    }
  }
}

main();

