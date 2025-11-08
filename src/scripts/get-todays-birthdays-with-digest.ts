import birthdayService from '../services/birthday.js';
import { getFullName } from '../utils/name-helpers.js';

/**
 * Script to get today's birthdays and optionally monthly digest if it's first day of month
 */

async function getTodaysBirthdaysWithDigest(): Promise<void> {
  try {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Getting birthdays...');
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
      todaysBirthdays.forEach(record => {
        const name = getFullName(record.firstName, record.lastName);
        console.log(`   🎂 ${name}`);
      });
    }
    
    console.log('\n✅ Completed successfully!');
  } catch (error) {
    console.error('\n❌ Error getting birthdays:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script
getTodaysBirthdaysWithDigest();

