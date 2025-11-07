import { createQuestionInterface, askQuestion, askConfirmation } from '../utils/cli/cli.js';
import { createReadWriteCalendarClient } from '../utils/calendar/calendar-auth.js';
import { getFullName } from '../utils/name/name-helpers.js';
import { parseInput } from '../utils/name/birthday-parser.js';
import { filterFlags } from '../utils/cli/script-helpers.js';
import { fromDate } from '../utils/date.js';
import birthdayService from '../services/birthday.js';

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
    // Let addBirthday() handle duplicate checking internally
    // Pass skipDuplicateCheck: true only if --force flag is set
    await birthdayService.addBirthday(birthday, forceFlag);
    process.exit(0);
  } catch (error) {
    // addBirthday() will display duplicates and throw error if found
    if (error instanceof Error && error.message === 'Duplicate birthday found') {
      console.log('❌ Duplicate detected. Use --force flag to add anyway:');
      console.log(`   yarn add-birthday "${input}" --force\n`);
    }
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

    // Check for duplicates to show user before asking for confirmation
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
      // Skip duplicate check in addBirthday() since we already checked and user confirmed
      await birthdayService.addBirthday(birthday, true);
    } else {
      rl.close();
      // No duplicates found, let addBirthday() handle the check (will be fast)
      await birthdayService.addBirthday(birthday, false);
    }
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
