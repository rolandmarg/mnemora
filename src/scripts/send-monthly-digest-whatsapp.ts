import birthdayService from '../services/birthday.js';
import { OutputChannelFactory } from '../factories/output-channel.factory.js';
import { logger } from '../utils/logger.js';

/**
 * Script to send monthly digest to WhatsApp group
 * 
 * Gets the monthly digest of upcoming birthdays and sends it to the configured WhatsApp group
 * 
 * Usage: yarn send-monthly-digest-whatsapp [group-name]
 * If group-name is not provided, uses WHATSAPP_GROUP_ID from .env
 * 
 * If not authenticated, will display QR code in terminal for scanning
 */

async function sendMonthlyDigestWhatsApp(): Promise<void> {
  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;
  let exitCode = 0;

  try {
    const groupName = process.argv[2]; // Get group name from command line argument
    
    console.log('\n🚀 Starting WhatsApp Monthly Digest Script\n');
    if (groupName) {
      console.log(`📱 Target Group: ${groupName}\n`);
    }
    
    logger.info('Getting monthly digest...');
    
    const { todaysBirthdays, monthlyDigest } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (!monthlyDigest) {
      console.log('⚠️  No monthly digest available\n');
      logger.warn('No monthly digest available');
      process.exit(0);
    }

    console.log('📅 Monthly Digest:');
    console.log(monthlyDigest);
    console.log('');

    logger.info('Monthly digest generated', { 
      digestLength: monthlyDigest.length,
      todaysBirthdaysCount: todaysBirthdays.length,
    });

    // Create WhatsApp channel
    console.log('📱 Initializing WhatsApp connection...\n');
    whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
    
    if (!whatsappChannel.isAvailable() && !groupName) {
      console.log('❌ WhatsApp channel is not available.');
      console.log('   Please set WHATSAPP_GROUP_ID in your .env file or provide group name as argument\n');
      logger.error('WhatsApp channel is not available. Please set WHATSAPP_GROUP_ID in .env or provide group name');
      exitCode = 1;
      return;
    }

    console.log('📤 Sending monthly digest to WhatsApp group...\n');
    logger.info('Sending monthly digest to WhatsApp group...', { groupName });
    
    // The send method will handle initialization and QR code display if needed
    // Pass group name if provided, otherwise it will use config
    const result = await whatsappChannel.send(monthlyDigest, groupName ? {
      recipients: [groupName],
    } : undefined);
    
    if (result.success) {
      console.log('✅ Monthly digest sent to WhatsApp successfully!');
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   Recipient: ${result.recipient}\n`);
      logger.info('Monthly digest sent to WhatsApp successfully', {
        messageId: result.messageId,
        recipient: result.recipient,
      });
      logger.info('Completed successfully!');
    } else {
      console.log('❌ Failed to send monthly digest to WhatsApp');
      console.log(`   Error: ${result.error?.message}\n`);
      logger.error('Failed to send monthly digest to WhatsApp', {
        error: result.error?.message,
      });
      exitCode = 1;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('❌ Error sending monthly digest to WhatsApp');
    console.log(`   Error: ${errorMessage}\n`);
    logger.error('Error sending monthly digest to WhatsApp', error);
    exitCode = 1;
  } finally {
    // Give the client time to save the session before destroying
    if (whatsappChannel) {
      try {
        logger.info('Waiting for session to be saved...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Cleanup WhatsApp client (without logging out to preserve session)
        if ('destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
          await whatsappChannel.destroy();
        }
      } catch (error) {
        logger.error('Error during cleanup', error);
        // Don't fail the script if cleanup fails
      }
    }
    
    process.exit(exitCode);
  }
}

// Run the script
sendMonthlyDigestWhatsApp();

