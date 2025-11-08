import birthdayService from '../services/birthday.js';
import { extractNameFromEvent } from '../clients/google-calendar.client.js';

/**
 * Script to get today's birthdays
 */

async function getTodaysBirthdays(): Promise<void> {
  try {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Getting today\'s birthdays...');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const birthdays = await birthdayService.getTodaysBirthdays();
    
    if (birthdays.length === 0) {
      console.log('No birthdays today!');
    } else {
      console.log(`🎉 Found ${birthdays.length} birthday(s) today:\n`);
      birthdays.forEach(event => {
        const name = extractNameFromEvent(event);
        console.log(`   🎂 ${name}`);
      });
    }
    
    console.log('\n✅ Completed successfully!');
  } catch (error) {
    console.error('\n❌ Error getting today\'s birthdays:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the script
getTodaysBirthdays();

