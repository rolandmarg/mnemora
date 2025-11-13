import { OutputChannelFactory } from '../factories/output-channel.factory.js';
import { logger } from '../utils/logger.js';

/**
 * Script to send a test message to a WhatsApp group by name
 * 
 * Usage: yarn send-test-message-whatsapp "Group Name" "Message"
 */

async function sendTestMessageWhatsApp(): Promise<void> {
  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;
  let exitCode = 0;

  try {
    const groupName = process.argv[2] || 'Bday bot testing';
    const message = process.argv[3] || '🎂 🎉 Test message from birthday bot!';

    console.log('\n🚀 Starting WhatsApp Test Message Script\n');
    console.log(`📱 Group: ${groupName}`);
    console.log(`💬 Message: ${message}\n`);
    
    logger.info('Sending test message to WhatsApp', { groupName, message });

    // Create WhatsApp channel
    console.log('📱 Initializing WhatsApp connection...\n');
    whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel();
    
    if (!whatsappChannel.isAvailable()) {
      console.log('❌ WhatsApp channel is not available.');
      console.log('   Please set WHATSAPP_GROUP_ID in your .env file\n');
      logger.error('WhatsApp channel is not available. Please set WHATSAPP_GROUP_ID in .env');
      exitCode = 1;
      return;
    }

    console.log('📤 Sending message to WhatsApp group...\n');
    logger.info('Sending message to WhatsApp group...');
    
    // Send message using group name
    const result = await whatsappChannel.send(message, {
      recipients: [groupName],
    });
    
    if (result.success) {
      console.log('✅ Message sent to WhatsApp successfully!');
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   Recipient: ${result.recipient}\n`);
      logger.info('Message sent to WhatsApp successfully', {
        messageId: result.messageId,
        recipient: result.recipient,
      });
    } else {
      console.log('❌ Failed to send message to WhatsApp');
      console.log(`   Error: ${result.error?.message}\n`);
      logger.error('Failed to send message to WhatsApp', {
        error: result.error?.message,
      });
      exitCode = 1;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('❌ Error sending message to WhatsApp');
    console.log(`   Error: ${errorMessage}\n`);
    logger.error('Error sending message to WhatsApp', error);
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
sendTestMessageWhatsApp();

