import birthdayService from './services/birthday.js';
import { extractNameFromEvent } from './utils/name/name-helpers.js';
import { isFirstDayOfMonth, today } from './utils/date.js';

/**
 * Manual execution mode - runs once and exits
 * Scheduling is disabled. Run manually with: npm start or npm run dev
 */

async function runBirthdayCheck(): Promise<void> {
  try {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Running birthday check...');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const todayDate = today();
    const isFirstDay = isFirstDayOfMonth(todayDate);
    
    // Optimize: On first day of month, fetch month data once and use for both digest and today's birthdays
    if (isFirstDay) {
      console.log('📅 First day of month detected - generating monthly digest');
      const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysAndMonthlyDigest();
      console.log(monthlyDigest);
      
      if (todaysBirthdays.length === 0) {
        console.log('\nNo birthdays today!');
      } else {
        console.log(`\n🎉 Found ${todaysBirthdays.length} birthday(s) today:\n`);
        todaysBirthdays.forEach(event => {
          const name = extractNameFromEvent(event);
          console.log(`   🎂 ${name}`);
        });
      }
    } else {
      // Regular day: just fetch today's birthdays
      const todaysBirthdays = await birthdayService.getTodaysBirthdays();
      
      if (todaysBirthdays.length === 0) {
        console.log('No birthdays today!');
      } else {
        console.log(`\n🎉 Found ${todaysBirthdays.length} birthday(s) today:\n`);
        todaysBirthdays.forEach(event => {
          const name = extractNameFromEvent(event);
          console.log(`   🎂 ${name}`);
        });
      }
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

