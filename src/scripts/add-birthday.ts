import { calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { createQuestionInterface, askQuestion, askConfirmation } from '../utils/cli.js';
import { formatDateISO } from '../utils/date.js';
import { createReadWriteCalendarClient } from '../utils/calendar-auth.js';
import { fetchEvents, getFullName, eventNameMatches, formatDuplicateEvent } from '../utils/calendar-helpers.js';
import { parseInput, type BirthdayInput } from './add-birthday-parser.js';

/**
 * Script to add birthday events to Google Calendar
 * Usage: yarn add-birthday
 * Or: yarn add-birthday "John Doe" "1990-05-15"
 */


async function checkForDuplicates(
  calendar: calendar_v3.Calendar,
  birthday: BirthdayInput
): Promise<calendar_v3.Schema$Event[]> {
  try {
    const eventDate = new Date(birthday.birthday);
    const events = await fetchEvents(calendar, {
      startDate: eventDate,
      endDate: eventDate,
    });
    
    return events.filter(event => {
      const summary = (event.summary ?? '').toLowerCase();
      return summary.includes('birthday') && 
             eventNameMatches(event.summary ?? '', birthday.firstName, birthday.lastName);
    });
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    return [];
  }
}

function displayDuplicates(duplicates: calendar_v3.Schema$Event[], fullName: string, date: Date): void {
  console.log('\n⚠️  Potential duplicate(s) found:');
  duplicates.forEach((dup, index) => console.log(formatDuplicateEvent(dup, index + 1)));
  console.log(`\n   Trying to add: ${fullName}'s Birthday`);
  console.log(`   Date: ${date.toLocaleDateString()}\n`);
}

async function addBirthdayToCalendar(birthday: BirthdayInput, skipDuplicateCheck: boolean = false): Promise<void> {
  const calendar = createReadWriteCalendarClient();
  const fullName = getFullName(birthday.firstName, birthday.lastName);
  
  if (!skipDuplicateCheck) {
    const duplicates = await checkForDuplicates(calendar, birthday);
    if (duplicates.length > 0) {
      displayDuplicates(duplicates, fullName, new Date(birthday.birthday));
      return;
    }
  }

  const dateString = formatDateISO(new Date(birthday.birthday));
  const event: calendar_v3.Schema$Event = {
    summary: `${fullName}'s Birthday`,
    description: `Birthday of ${fullName}${birthday.year ? ` (born ${birthday.year})` : ''}`,
    start: { date: dateString, timeZone: 'UTC' },
    end: { date: dateString, timeZone: 'UTC' },
    recurrence: ['RRULE:FREQ=YEARLY;INTERVAL=1'],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: config.google.calendarId,
      requestBody: event,
    });

    console.log('\n✅ Birthday event created successfully!');
    console.log(`   Title: ${event.summary}`);
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
        displayDuplicates(duplicates, getFullName(birthday.firstName, birthday.lastName), new Date(birthday.birthday));
        console.log('❌ Duplicate detected. Use --force flag to add anyway:');
        console.log(`   yarn add-birthday "${input}" --force\n`);
        process.exit(1);
      }
      
      await addBirthdayToCalendar(birthday, forceFlag);
      process.exit(0);
    } catch {
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
      const birthday = parseInput(`${firstName} ${lastName ?? ''} ${birthdayInput}`.trim());
      
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
        displayDuplicates(duplicates, getFullName(birthday.firstName, birthday.lastName), new Date(birthday.birthday));
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
    } catch {
      rl.close();
      process.exit(1);
    }
  }
}

main();

