import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { config } from '../config.js';

interface FetchLogsOptions {
  environment?: 'dev' | 'prod';
  since?: string; // e.g., '1h', '24h', '7d'
  follow?: boolean;
}

/**
 * Fetches CloudWatch logs for all Lambda functions
 */
async function fetchLogs(options: FetchLogsOptions = {}): Promise<void> {
  const { environment = 'prod', since = '1h', follow = false } = options;

  const logGroups = [
    `/aws/lambda/mnemora-birthday-bot-${environment}`,
    `/aws/lambda/mnemora-daily-summary-${environment}`,
  ];

  const region = config.aws.region || process.env.AWS_REGION || 'us-west-1';
  const client = new CloudWatchLogsClient({ region });

  // Convert 'since' to startTime (milliseconds since epoch)
  const now = Date.now();
  let startTime: number;
  
  if (since.endsWith('m')) {
    const minutes = parseInt(since.slice(0, -1), 10);
    startTime = now - minutes * 60 * 1000;
  } else if (since.endsWith('h')) {
    const hours = parseInt(since.slice(0, -1), 10);
    startTime = now - hours * 60 * 60 * 1000;
  } else if (since.endsWith('d')) {
    const days = parseInt(since.slice(0, -1), 10);
    startTime = now - days * 24 * 60 * 60 * 1000;
  } else {
    // Default to 1 hour
    startTime = now - 60 * 60 * 1000;
  }

  console.log(`Fetching logs from ${region} for environment: ${environment}`);
  console.log(`Time range: ${since} (from ${new Date(startTime).toISOString()} to ${new Date(now).toISOString()})`);
  console.log('='.repeat(80));

  try {
    for (const logGroupName of logGroups) {
      console.log(`\n📋 Log Group: ${logGroupName}`);
      console.log('-'.repeat(80));

      try {
        const command = new FilterLogEventsCommand({
          logGroupName,
          startTime,
          endTime: now,
        });

        const response = await client.send(command);
        const events = response.events || [];

        if (events.length === 0) {
          console.log('   No log events found in the specified time range.');
        } else {
          console.log(`   Found ${events.length} log event(s):\n`);
          
          for (const event of events) {
            const timestamp = event.timestamp 
              ? new Date(event.timestamp).toISOString()
              : 'N/A';
            const message = event.message || '';
            
            // Format similar to 'aws logs tail --format short'
            console.log(`[${timestamp}] ${message}`);
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'ResourceNotFoundException') {
          console.log(`   ⚠️  Log group not found: ${logGroupName}`);
        } else {
          console.error(`   ❌ Error fetching logs from ${logGroupName}:`, error);
        }
      }
    }

    if (!follow) {
      console.log('\n' + '='.repeat(80));
      console.log('Log fetch completed.');
    }
  } catch (error) {
    console.error('Error fetching logs:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: FetchLogsOptions = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--env' || arg === '-e') {
    const env = args[++i];
    if (env === 'dev' || env === 'prod') {
      options.environment = env;
    } else {
      console.error(`Invalid environment: ${env}. Must be 'dev' or 'prod'.`);
      process.exit(1);
    }
  } else if (arg === '--since' || arg === '-s') {
    options.since = args[++i];
  } else if (arg === '--follow' || arg === '-f') {
    options.follow = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: yarn fetch-logs [options]

Options:
  --env, -e <env>      Environment: 'dev' or 'prod' (default: 'prod')
  --since, -s <time>   Time range: e.g., '10m', '1h', '24h', '7d' (default: '1h')
  --follow, -f         Follow logs in real-time (not yet implemented)
  --help, -h           Show this help message

Examples:
  yarn fetch-logs
  yarn fetch-logs --env dev --since 24h
  yarn fetch-logs --since 10m
    `);
    process.exit(0);
  }
}

fetchLogs(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

