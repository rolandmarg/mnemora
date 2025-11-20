import { SSMClient, PutParameterCommand, GetParameterCommand, type PutParameterCommandInput } from '@aws-sdk/client-ssm';

const PARAMETER_PATHS: Record<string, string> = {
  'whatsapp.groupId': '/mnemora/prod/whatsapp/groupId',
  'schedule.time': '/mnemora/prod/schedule/time',
  'schedule.timezone': '/mnemora/prod/schedule/timezone',
  'logging.level': '/mnemora/prod/logging/level',
  'google.spreadsheetId': '/mnemora/prod/google/spreadsheetId',
};

async function updateParameter(name: string, value: string, region: string = 'us-west-1'): Promise<void> {
  const ssmClient = new SSMClient({ region });
  const fullPath = PARAMETER_PATHS[name];

  if (!fullPath) {
    console.error(`❌ Unknown parameter: ${name}`);
    console.error(`Available parameters: ${Object.keys(PARAMETER_PATHS).join(', ')}`);
    process.exit(1);
  }

  try {
    // Get current value
    try {
      const getResponse = await ssmClient.send(new GetParameterCommand({ Name: fullPath }));
      console.log(`Current value: ${getResponse.Parameter?.Value ?? '(not set)'}`);
    } catch {
      console.log('Current value: (not set)');
    }

    // Update parameter
    const input: PutParameterCommandInput = {
      Name: fullPath,
      Value: value,
      Type: 'String',
      Overwrite: true,
      Description: `Mnemora configuration: ${name}`,
    };

    await ssmClient.send(new PutParameterCommand(input));
    console.log(`✅ Updated ${name} to: ${value}`);
    console.log(`   Parameter path: ${fullPath}`);
  } catch (error) {
    console.error(`❌ Failed to update parameter ${name}:`, error);
    process.exit(1);
  }
}

async function listParameters(region: string = 'us-west-1'): Promise<void> {
  const ssmClient = new SSMClient({ region });

  console.log('Current Parameter Store values:');
  console.log('');

  for (const [key, path] of Object.entries(PARAMETER_PATHS)) {
    try {
      const response = await ssmClient.send(new GetParameterCommand({ Name: path }));
      const value = response.Parameter?.Value ?? '(not set)';
      const displayValue = key.includes('groupId') || key.includes('spreadsheetId') 
        ? (value.length > 20 ? `${value.substring(0, 20)}...` : value)
        : value;
      console.log(`  ${key.padEnd(25)} = ${displayValue}`);
    } catch {
      console.log(`  ${key.padEnd(25)} = (not set)`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
    await listParameters();
    return;
  }

  if (args.length < 2) {
    console.error('Usage:');
    console.error('  yarn update-config list                    # List all parameters');
    console.error('  yarn update-config <parameter> <value>     # Update a parameter');
    console.error('');
    console.error('Available parameters:');
    for (const key of Object.keys(PARAMETER_PATHS)) {
      console.error(`  - ${key}`);
    }
    process.exit(1);
  }

  const [parameterName, ...valueParts] = args;
  const value = valueParts.join(' ');

  if (!value) {
    console.error('❌ Value cannot be empty');
    process.exit(1);
  }

  await updateParameter(parameterName, value);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

