import cron from 'node-cron';
import birthdayService from './services/birthday.js';
import whatsappService from './services/whatsapp.js';
import { config } from './config.js';

// Initialize WhatsApp service on startup
console.log('Initializing WhatsApp service...');
whatsappService.initialize().catch(console.error);

// Parse schedule time (format: HH:MM)
const [hours, minutes] = config.schedule.time.split(':').map(Number);

// Schedule daily task at configured time
const cronExpression = `${minutes} ${hours} * * *`;

console.log(`Scheduling daily task at ${config.schedule.time} (cron: ${cronExpression})`);

cron.schedule(cronExpression, async () => {
  console.log(`\n[${new Date().toISOString()}] Running scheduled task...`);
  
  try {
    // Check if it's the first day of the month
    if (birthdayService.isFirstDayOfMonth()) {
      console.log('First day of month detected - sending monthly digest');
      await birthdayService.sendMonthlyDigest();
    }
    
    // Always check for today's birthdays
    await birthdayService.checkTodaysBirthdays();
    
    console.log('Scheduled task completed successfully');
  } catch (error) {
    console.error('Error in scheduled task:', error);
  }
});

// Also run immediately on startup for testing (optional)
console.log('\nRunning initial check...');
(async () => {
  try {
    if (birthdayService.isFirstDayOfMonth()) {
      await birthdayService.sendMonthlyDigest();
    }
    await birthdayService.checkTodaysBirthdays();
  } catch (error) {
    console.error('Error in initial check:', error);
  }
})();

console.log('Bot is running. Press Ctrl+C to stop.');

