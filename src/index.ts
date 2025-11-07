import birthdayService from './services/birthday.js';
import whatsappService from './services/whatsapp.js';

/**
 * Manual execution mode - runs once and exits
 * Scheduling is disabled. Run manually with: npm start or npm run dev
 */

async function runBirthdayCheck(): Promise<void> {
  try {
    console.log('Initializing WhatsApp service...');
    await whatsappService.initialize();
    await whatsappService.waitForReady(60000); // 60 second timeout
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('Running birthday check...');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Check if it's the first day of the month
    if (birthdayService.isFirstDayOfMonth()) {
      console.log('📅 First day of month detected - sending monthly digest');
      await birthdayService.sendMonthlyDigest();
    }
    
    // Always check for today's birthdays
    await birthdayService.checkTodaysBirthdays();
    
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

