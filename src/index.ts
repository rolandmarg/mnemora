import birthdayService from './services/birthday.js';
import { extractNameFromEvent } from './utils/name/name-helpers.js';

/**
 * Manual execution mode - runs once and exits
 * Scheduling is disabled. Run manually with: npm start or npm run dev
 */

async function runBirthdayCheck(): Promise<void> {
  try {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Running birthday check...');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysWithOptionalDigest();
    
    if (monthlyDigest) {
      console.log('📅 First day of month detected - generating monthly digest');
      console.log(monthlyDigest);
    }
    
    if (todaysBirthdays.length === 0) {
      console.log(monthlyDigest ? '\nNo birthdays today!' : 'No birthdays today!');
    } else {
      console.log(`\n🎉 Found ${todaysBirthdays.length} birthday(s) today:\n`);
      todaysBirthdays.forEach(event => {
        const name = extractNameFromEvent(event);
        console.log(`   🎂 ${name}`);
      });
    }
    
    console.log('\n✅ Birthday check completed successfully!');
  } catch (error) {
    console.error('\n❌ Error in birthday check:', error);
    process.exit(1);
  } finally {
    // Exit after completion
    process.exit(0);
  }
}

// Run the check
runBirthdayCheck();

