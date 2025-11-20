/**
 * Test Lambda Birthday Check Locally
 * 
 * Runs the same logic as the Lambda handler to test how many events get added
 * This mimics the exact flow that runs in AWS Lambda
 */

import { runBirthdayCheck } from '../services/birthday-orchestrator.service.js';
import { appContext } from '../app-context.js';
import { BirthdayService } from '../services/birthday.service.js';

async function testLambdaBirthdayCheck(): Promise<void> {
  console.log('==========================================');
  console.log('Testing Lambda Birthday Check Logic Locally');
  console.log('==========================================');
  console.log('');

  try {
    // Count existing birthdays before sync
    const birthdayService = new BirthdayService(appContext);
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear + 1, 11, 31);
    
    console.log('Step 1: Counting existing birthdays in calendar...');
    const existingBefore = await birthdayService.getBirthdays(yearStart, yearEnd);
    console.log(`Found ${existingBefore.length} existing birthday event(s) in calendar`);
    console.log('');

    // Run the exact same logic as Lambda handler
    console.log('Step 2: Running birthday check (same as Lambda handler)...');
    console.log('This will sync from Sheets to Calendar...');
    console.log('');
    
    await runBirthdayCheck(appContext);
    
    console.log('');
    console.log('Step 3: Counting birthdays after sync...');
    
    // Wait a moment for calendar API to update
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const existingAfter = await birthdayService.getBirthdays(yearStart, yearEnd);
    console.log(`Found ${existingAfter.length} birthday event(s) in calendar after sync`);
    console.log('');

    const added = existingAfter.length - existingBefore.length;
    
    console.log('==========================================');
    console.log('Results:');
    console.log('==========================================');
    console.log(`Before sync: ${existingBefore.length} events`);
    console.log(`After sync:  ${existingAfter.length} events`);
    console.log(`Added:       ${added} events`);
    console.log('');
    
    if (added > 0) {
      console.log(`⚠️  WARNING: ${added} new event(s) were added!`);
      console.log('This suggests the duplicate check is not working properly.');
    } else if (added < 0) {
      console.log(`⚠️  WARNING: ${Math.abs(added)} event(s) were removed (unexpected)`);
    } else {
      console.log('✅ No new events added - duplicate check is working correctly!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing lambda birthday check:', error);
    process.exit(1);
  }
}

testLambdaBirthdayCheck();

