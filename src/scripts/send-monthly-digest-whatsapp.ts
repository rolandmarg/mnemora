import { BirthdayService } from '../services/birthday.service.js';
import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import calendarClient from '../clients/google-calendar.client.js';
import xrayClient from '../clients/xray.client.js';
import whatsappClient from '../clients/whatsapp.client.js';
import cloudWatchMetricsClient from '../clients/cloudwatch.client.js';
import { requireDevelopment, auditManualSend, SecurityError } from '../utils/security.util.js';

async function sendMonthlyDigestWhatsApp(): Promise<void> {
  const birthdayService = new BirthdayService(logger, config, calendarClient, xrayClient);
  
  try {
    requireDevelopment(logger);
  } catch (error) {
    if (error instanceof SecurityError) {
      auditManualSend(logger, 'send-monthly-digest-whatsapp.ts', {
        blocked: true,
        reason: 'production_environment',
      });
      logger.error('SECURITY: Monthly digest send blocked in production', {
        script: 'send-monthly-digest-whatsapp.ts',
        environment: config.environment,
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
  auditManualSend(logger, 'send-monthly-digest-whatsapp.ts', {
    blocked: false,
    environment: config.environment,
    groupName,
  });

  try {
    
    console.log('\n🚀 Starting WhatsApp Monthly Digest Script\n');
    
    logger.info('Getting monthly digest...');
    
    const { todaysBirthdays, monthlyBirthdays } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (!monthlyBirthdays || monthlyBirthdays.length === 0) {
      console.log('⚠️  No monthly birthdays available\n');
      logger.warn('No monthly birthdays available');
      process.exit(0);
    }

    const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);

    console.log('📅 Monthly Digest:');
    console.log(monthlyDigest);
    console.log('');

    logger.info('Monthly digest generated', { 
      digestLength: monthlyDigest.length,
      todaysBirthdaysCount: todaysBirthdays.length,
      monthlyBirthdaysCount: monthlyBirthdays.length,
    });

    console.log('📱 Initializing WhatsApp connection...\n');
    whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel(logger, config, whatsappClient, cloudWatchMetricsClient);
    
    if (!whatsappChannel.isAvailable()) {
      console.log('❌ WhatsApp channel is not available.');
      console.log('   Please set WHATSAPP_GROUP_ID in your .env file\n');
      logger.error('WhatsApp channel is not available. Please set WHATSAPP_GROUP_ID in .env');
      exitCode = 1;
      return;
    }

    // Resolve group identifier early, before logging
    let resolvedGroupId: string;
    try {
      resolvedGroupId = await whatsappChannel.resolveGroupId(groupName);
      console.log(`📱 Target Group: ${resolvedGroupId}\n`);
      logger.info('Group identifier resolved', {
        groupId: resolvedGroupId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to resolve group identifier: ${errorMessage}\n`);
      logger.error('Failed to resolve group identifier', error);
      exitCode = 1;
      return;
    }

    console.log('📤 Sending monthly digest to WhatsApp group...\n');
    logger.info('Sending monthly digest to WhatsApp group...', {
      groupId: resolvedGroupId,
    });
    
    const result = await whatsappChannel.send(monthlyDigest, {
      recipients: [resolvedGroupId],
    });
    
    if (result.success) {
      console.log('✅ Monthly digest sent to WhatsApp successfully!');
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   Recipient: ${resolvedGroupId}\n`);
      logger.info('Monthly digest sent to WhatsApp successfully', {
        messageId: result.messageId,
        recipient: result.recipient,
        groupId: resolvedGroupId,
      });
      logger.info('Completed successfully!');
    } else {
      console.log('❌ Failed to send monthly digest to WhatsApp');
      console.log(`   Error: ${result.error?.message}\n`);
      logger.error('Failed to send monthly digest to WhatsApp', {
        error: result.error?.message,
        groupId: resolvedGroupId,
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
        // Wait longer to allow Baileys to finish background operations
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        if ('destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
          await whatsappChannel.destroy();
        }
      } catch (error) {
        // Ignore connection closed errors during cleanup - they're expected
        // when Baileys is still processing background operations
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('Connection Closed') && !errorMessage.includes('Connection closed')) {
          logger.error('Error during cleanup', error);
        }
      }
    }
    
    // Give a moment for any final cleanup before exiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(exitCode);
  }
}

sendMonthlyDigestWhatsApp();

