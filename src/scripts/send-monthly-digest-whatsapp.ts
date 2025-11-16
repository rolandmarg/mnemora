import birthdayService from '../services/birthday.service.js';
import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { logger } from '../clients/logger.client.js';
import { requireDevelopment, auditManualSend, SecurityError } from '../utils/security.util.js';

async function sendMonthlyDigestWhatsApp(): Promise<void> {
  try {
    requireDevelopment();
  } catch (error) {
    if (error instanceof SecurityError) {
      auditManualSend('send-monthly-digest-whatsapp.ts', {
        blocked: true,
        reason: 'production_environment',
      });
      logger.error('SECURITY: Monthly digest send blocked in production', {
        script: 'send-monthly-digest-whatsapp.ts',
        environment: process.env.NODE_ENV,
      });
      console.error('\n❌ SECURITY ERROR: Monthly digest send is disabled in production\n');
      console.error('Manual send scripts are disabled in production environment.');
      console.error('Set NODE_ENV=development to enable manual sending.\n');
      process.exit(1);
    }
    throw error;
  }

  let whatsappChannel: ReturnType<typeof OutputChannelFactory.createWhatsAppOutputChannel> | null = null;
  let exitCode = 0;

  const groupName = process.argv[2];
  auditManualSend('send-monthly-digest-whatsapp.ts', {
    blocked: false,
    environment: process.env.NODE_ENV ?? 'development',
    groupName: groupName || 'from-config',
  });

  try {
    
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
    if (whatsappChannel) {
      try {
        logger.info('Waiting for session to be saved...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if ('destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
          await whatsappChannel.destroy();
        }
      } catch (error) {
        logger.error('Error during cleanup', error);
      }
    }
    
    process.exit(exitCode);
  }
}

sendMonthlyDigestWhatsApp();

