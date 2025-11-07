import whatsappService from '../services/whatsapp.js';

/**
 * Helper script to find WhatsApp group IDs
 * Usage: npm run find-group
 */

async function findGroupIds(): Promise<void> {
  try {
    console.log('Initializing WhatsApp...');
    console.log('This may take a moment. If you see a QR code, scan it with WhatsApp on your phone.\n');
    
    await whatsappService.initialize();
    
    console.log('\nWaiting for WhatsApp to be ready...');
    console.log('If you see a QR code above, please scan it with WhatsApp now.');
    console.log('Waiting up to 60 seconds for authentication...\n');
    
    await whatsappService.waitForReady(60000); // 60 second timeout

    const client = whatsappService.clientInstance;
    if (!client) {
      throw new Error('WhatsApp client not initialized');
    }

    console.log('\nFetching all groups...');
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    if (groups.length === 0) {
      console.log('No groups found.');
      return;
    }

    console.log(`\nFound ${groups.length} group(s):\n`);
    groups.forEach((group, index) => {
      const groupId = group.id._serialized.replace('@g.us', '');
      console.log(`${index + 1}. ${group.name}`);
      console.log(`   ID: ${groupId}`);
      console.log(`   Full ID: ${group.id._serialized}\n`);
    });

    console.log('\nCopy the ID (without @g.us) to your .env file as WHATSAPP_GROUP_ID');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

findGroupIds();

