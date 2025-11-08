import birthdayService from '../services/birthday.js';
import { extractNameFromEvent } from '../clients/google-calendar.client.js';

/**
 * Script to get monthly digest of upcoming birthdays
 */

async function getMonthlyDigest(): Promise<void> {
  try {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Getting monthly digest...');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (todaysBirthdays.length > 0) {
      console.log('🎉 Today\'s birthdays:\n');
      todaysBirthdays.forEach(event => {
        const name = extractNameFromEvent(event);
        console.log(`   🎂 ${name}`);
      });
      console.log('');
    }
    
    if (monthlyDigest) {
      console.log(monthlyDigest);
    }
    
    console.log('\n✅ Completed successfully!');
  } catch (error) {
    console.error('\n❌ Error getting monthly digest:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script
getMonthlyDigest();

