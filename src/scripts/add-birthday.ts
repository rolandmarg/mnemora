import { createQuestionInterface, askQuestion, askConfirmation } from '../utils/cli.js';
import { createReadWriteCalendarClient } from '../utils/calendar-auth.js';
import { getFullName } from '../utils/calendar-helpers.js';
import { parseInput } from '../utils/add-birthday-parser.js';
import { filterFlags } from '../utils/script-helpers.js';
import { fromDate } from '../utils/date.js';
import birthdayService from '../services/birthday-service.js';

/**
 * Script to add birthday events to Google Calendar
 * Usage: yarn add-birthday
 * Or: yarn add-birthday "John Doe" "1990-05-15"
 */

function printParseError(): void {
  console.error('❌ Could not parse input. Please use format:');
  console.error('   "Name LastName YYYY-MM-DD"');
  console.error('   "Name LastName MM-DD"');
  console.error('   "Name LastName Month DD, YYYY"');
  console.error('   "Name LastName Month DD"');
}

function printBirthdayParseError(): void {
  console.error('\n❌ Could not parse birthday. Please use format:');
  console.error('   YYYY-MM-DD (e.g., 1990-05-15)');
  console.error('   MM-DD (e.g., 05-15)');
  console.error('   Month DD, YYYY (e.g., May 15, 1990)');
  console.error('   Month DD (e.g., May 15)');
}

async function handleCommandLineMode(args: string[]): Promise<void> {
  const forceFlag = args.includes('--force') || args.includes('-f');
  const filteredArgs = filterFlags(args, 'force', 'f');
  
  if (filteredArgs.length === 0) {
    return;
  }

  const input = filteredArgs.join(' ');
  const birthday = parseInput(input);

  if (!birthday) {
    printParseError();
    process.exit(1);
  }

  try {
    const calendar = createReadWriteCalendarClient();
    const duplicates = await birthdayService.checkForDuplicates(calendar, birthday);

    if (duplicates.length > 0 && !forceFlag) {
      birthdayService.displayDuplicates(
        duplicates,
        getFullName(birthday.firstName, birthday.lastName),
        fromDate(birthday.birthday)
      );
      console.log('❌ Duplicate detected. Use --force flag to add anyway:');
      console.log(`   yarn add-birthday "${input}" --force\n`);
      process.exit(1);
    }

    await birthdayService.addBirthday(birthday, forceFlag);
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

async function handleInteractiveMode(): Promise<void> {
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
      printBirthdayParseError();
      rl.close();
      process.exit(1);
    }

    // Override with actual input
    birthday.firstName = firstName;
    birthday.lastName = lastName;

    // Check for duplicates
    const calendar = createReadWriteCalendarClient();
    const duplicates = await birthdayService.checkForDuplicates(calendar, birthday);

    if (duplicates.length > 0) {
      birthdayService.displayDuplicates(
        duplicates,
        getFullName(birthday.firstName, birthday.lastName),
        fromDate(birthday.birthday)
      );
      const confirm = await askConfirmation(rl, 'Add anyway? (y/n): ');
      rl.close();
      if (!confirm) {
        console.log('❌ Cancelled. Birthday not added.');
        process.exit(0);
      }
    } else {
      rl.close();
    }

    await birthdayService.addBirthday(birthday, duplicates.length > 0);
    process.exit(0);
  } catch {
    rl.close();
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  await handleCommandLineMode(args);
  await handleInteractiveMode();
}

main();
