import { BirthdayService } from '../services/birthday.service.js';
import { OutputChannelFactory } from '../output-channel/output-channel.factory.js';
import { appContext } from '../app-context.js';
import { requireDevelopment, auditManualSend, SecurityError } from '../utils/security.util.js';

async function sendMonthlyDigestWhatsApp(): Promise<void> {
  const birthdayService = new BirthdayService(appContext);
  
  try {
    requireDevelopment(appContext);
  } catch (error) {
    if (error instanceof SecurityError) {
      auditManualSend(appContext, 'send-monthly-digest-whatsapp.ts', {
        blocked: true,
        reason: 'production_environment',
      });
      appContext.logger.error('SECURITY: Monthly digest send blocked in production', {
        script: 'send-monthly-digest-whatsapp.ts',
        environment: appContext.environment,
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
  auditManualSend(appContext, 'send-monthly-digest-whatsapp.ts', {
    blocked: false,
    environment: appContext.environment,
    groupName,
  });

  try {
    
    console.log('\n🚀 Starting WhatsApp Monthly Digest Script\n');
    
    appContext.logger.info('Getting monthly digest...');
    
    const { todaysBirthdays, monthlyBirthdays } = await birthdayService.getTodaysBirthdaysWithMonthlyDigest();
    
    if (!monthlyBirthdays || monthlyBirthdays.length === 0) {
      console.log('⚠️  No monthly birthdays available\n');
      appContext.logger.warn('No monthly birthdays available');
      process.exit(0);
    }

    const monthlyDigest = birthdayService.formatMonthlyDigest(monthlyBirthdays);

    console.log('📅 Monthly Digest:');
    console.log(monthlyDigest);
    console.log('');

    appContext.logger.info('Monthly digest generated', { 
      digestLength: monthlyDigest.length,
      todaysBirthdaysCount: todaysBirthdays.length,
      monthlyBirthdaysCount: monthlyBirthdays.length,
    });

    console.log('📱 Initializing WhatsApp connection...\n');
    whatsappChannel = OutputChannelFactory.createWhatsAppOutputChannel(appContext);
    
    if (!whatsappChannel.isAvailable()) {
      console.log('❌ WhatsApp channel is not available.');
      console.log('   Please set WHATSAPP_GROUP_ID in your .env file\n');
      appContext.logger.error('WhatsApp channel is not available. Please set WHATSAPP_GROUP_ID in .env');
      exitCode = 1;
      return;
    }

    // Resolve group identifier early, before logging
    let resolvedGroupId: string;
    try {
      resolvedGroupId = await whatsappChannel.resolveGroupId(groupName);
      console.log(`📱 Target Group: ${resolvedGroupId}\n`);
      appContext.logger.info('Group identifier resolved', {
        groupId: resolvedGroupId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to resolve group identifier: ${errorMessage}\n`);
      appContext.logger.error('Failed to resolve group identifier', error);
      exitCode = 1;
      return;
    }

    console.log('📤 Sending monthly digest to WhatsApp group...\n');
    appContext.logger.info('Sending monthly digest to WhatsApp group...', {
      groupId: resolvedGroupId,
    });
    
    const result = await whatsappChannel.send(monthlyDigest, {
      recipients: [resolvedGroupId],
    });
    
    if (result.success) {
      console.log('✅ Monthly digest sent to WhatsApp successfully!');
      console.log(`   Message ID: ${result.messageId}`);
      console.log(`   Recipient: ${resolvedGroupId}\n`);
      appContext.logger.info('Monthly digest sent to WhatsApp successfully', {
        messageId: result.messageId,
        recipient: result.recipient,
        groupId: resolvedGroupId,
      });
      appContext.logger.info('Completed successfully!');
    } else {
      console.log('❌ Failed to send monthly digest to WhatsApp');
      console.log(`   Error: ${result.error?.message}\n`);
      appContext.logger.error('Failed to send monthly digest to WhatsApp', {
        error: result.error?.message,
        groupId: resolvedGroupId,
      });
      exitCode = 1;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('❌ Error sending monthly digest to WhatsApp');
    console.log(`   Error: ${errorMessage}\n`);
    appContext.logger.error('Error sending monthly digest to WhatsApp', error);
    exitCode = 1;
  } finally {
    if (whatsappChannel) {
      try {
        appContext.logger.info('Waiting for session to be saved...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if ('destroy' in whatsappChannel && typeof whatsappChannel.destroy === 'function') {
          await whatsappChannel.destroy();
        }
      } catch (error) {
        appContext.logger.error('Error during cleanup', error);
      }
    }
    
    process.exit(exitCode);
  }
}

sendMonthlyDigestWhatsApp();

