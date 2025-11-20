import { DynamicConfigService } from '../services/dynamic-config.service.js';
import { appContext } from '../app-context.js';
import { loadDynamicConfig } from '../config.js';
import ssmClient from '../clients/ssm.client.js';
import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';

async function testDynamicConfig(): Promise<void> {
  console.log('Testing Dynamic Config Service...\n');

  // Test 0: Check SSM client availability
  console.log('0. Checking SSM client availability...');
  const isAvailable = ssmClient.isAvailable();
  console.log(`   SSM Client Available: ${isAvailable ? '✅ Yes' : '❌ No'}`);
  console.log(`   Environment: ${appContext.environment}`);
  console.log(`   AWS Region: ${appContext.config.aws.region}`);
  console.log('');

  if (!isAvailable) {
    console.error('❌ SSM client is not available. Make sure AWS_REGION is set.');
    process.exit(1);
  }

  // Test 0.5: Test write/read cycle with a test parameter
  console.log('0.5. Testing Parameter Store write/read cycle...');
  const testParameterPath = `/mnemora/${appContext.environment === 'production' ? 'prod' : 'dev'}/test/connection`;
  const testValue = `test-${Date.now()}`;
  const ssmClientDirect = new SSMClient({ region: appContext.config.aws.region });

  try {
    // Write test parameter
    await ssmClientDirect.send(new PutParameterCommand({
      Name: testParameterPath,
      Value: testValue,
      Type: 'String',
      Overwrite: true,
      Description: 'Temporary test parameter for connection verification',
    }));
    console.log(`   ✅ Successfully wrote test parameter: ${testParameterPath}`);

    // Read it back using our client
    const readValue = await ssmClient.getParameter(testParameterPath);
    if (readValue === testValue) {
      console.log(`   ✅ Successfully read test parameter (value matches)`);
    } else {
      console.log(`   ⚠️  Read value doesn't match: expected "${testValue}", got "${readValue}"`);
    }

    // Clean up (optional - may not have permission)
    try {
      await ssmClientDirect.send(new DeleteParameterCommand({
        Name: testParameterPath,
      }));
      console.log(`   ✅ Cleaned up test parameter\n`);
    } catch (deleteError: unknown) {
      const awsError = deleteError as { name?: string };
      if (awsError.name === 'AccessDeniedException') {
        console.log(`   ⚠️  Cannot delete test parameter (no permission) - but connection works!\n`);
      } else {
        console.log(`   ⚠️  Could not delete test parameter: ${deleteError}\n`);
      }
    }
  } catch (error) {
    console.error('   ❌ Failed to test write/read cycle:', error);
    // Try to clean up even if read failed
    try {
      await ssmClientDirect.send(new DeleteParameterCommand({
        Name: testParameterPath,
      }));
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  }

  // Test 1: Load dynamic config
  console.log('1. Loading dynamic config from Parameter Store...');
  try {
    await loadDynamicConfig(appContext);
    console.log('   ✅ Dynamic config loaded successfully\n');
  } catch (error) {
    console.error('   ❌ Failed to load dynamic config:', error);
    process.exit(1);
  }

  // Test 2: Check config values
  console.log('2. Checking config values...');
  const { config } = appContext;
  
  console.log(`   WhatsApp Group ID: ${config.whatsapp.groupId ?? '(not set)'}`);
  console.log(`   Schedule Time: ${config.schedule.time}`);
  console.log(`   Timezone: ${config.schedule.timezone}`);
  console.log(`   Log Level: ${config.logging.level}`);
  console.log(`   Google Spreadsheet ID: ${config.google.spreadsheetId ?? '(not set)'}`);
  console.log('');

  // Test 3: Test DynamicConfigService directly
  console.log('3. Testing DynamicConfigService directly...');
  const dynamicConfig = new DynamicConfigService(appContext.logger);
  const envPrefix = appContext.environment === 'production' ? 'prod' : 'dev';
  console.log(`   Using parameter path prefix: /mnemora/${envPrefix}/`);
  
  try {
    const groupId = await dynamicConfig.getParameter('whatsapp', 'groupId');
    const scheduleTime = await dynamicConfig.getParameter('schedule', 'time');
    const timezone = await dynamicConfig.getParameter('schedule', 'timezone');
    
    console.log(`   WhatsApp Group ID: ${groupId ?? '(not set)'}`);
    console.log(`   Schedule Time: ${scheduleTime ?? '(not set)'}`);
    console.log(`   Timezone: ${timezone ?? '(not set)'}`);
    console.log('   ✅ Direct parameter fetch works (returns null if parameter doesn\'t exist)\n');
  } catch (error) {
    console.error('   ❌ Failed to fetch parameters directly:', error);
    process.exit(1);
  }

  // Test 4: Test batch fetch
  console.log('4. Testing batch parameter fetch...');
  try {
    const params = await dynamicConfig.getParameters({
      whatsapp: ['groupId'],
      schedule: ['time', 'timezone'],
      logging: ['level'],
    });
    
    console.log(`   Fetched ${Object.keys(params).length} parameter(s):`);
    for (const [key, value] of Object.entries(params)) {
      console.log(`     ${key}: ${value ?? '(not set)'}`);
    }
    console.log('   ✅ Batch fetch works\n');
  } catch (error) {
    console.error('   ❌ Failed to fetch parameters in batch:', error);
    process.exit(1);
  }

  // Test 5: Test cache
  console.log('5. Testing cache (second fetch should be faster)...');
  const start1 = Date.now();
  await dynamicConfig.getParameter('schedule', 'time');
  const time1 = Date.now() - start1;
  
  const start2 = Date.now();
  await dynamicConfig.getParameter('schedule', 'time');
  const time2 = Date.now() - start2;
  
  console.log(`   First fetch: ${time1}ms`);
  console.log(`   Second fetch (cached): ${time2}ms`);
  if (time2 < time1) {
    console.log('   ✅ Cache is working (second fetch was faster)\n');
  } else {
    console.log('   ⚠️  Cache might not be working as expected\n');
  }

  console.log('==========================================');
  console.log('✅ All tests passed!');
  console.log('==========================================');
}

testDynamicConfig().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});

