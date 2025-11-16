import { CloudWatchLogsClient, PutLogEventsCommand, type InputLogEvent } from '@aws-sdk/client-cloudwatch-logs';
import { config } from '../config.js';

class CloudWatchLogsClientWrapper {
  private cloudWatchClient: CloudWatchLogsClient | null = null;
  private readonly isLambda: boolean;

  constructor() {
    this.isLambda = !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ??
      process.env.LAMBDA_TASK_ROOT ??
      process.env.AWS_EXECUTION_ENV
    );

    if (this.isLambda && config.aws?.region) {
      this.cloudWatchClient = new CloudWatchLogsClient({
        region: config.aws.region,
      });
    }
  }

  isAvailable(): boolean {
    return this.cloudWatchClient !== null;
  }

  async putLogEvents(
    logGroupName: string,
    logStreamName: string,
    logEvents: InputLogEvent[]
  ): Promise<void> {
    if (!this.cloudWatchClient) {
      throw new Error('CloudWatch Logs client not initialized. Check AWS_REGION environment variable.');
    }

    const command = new PutLogEventsCommand({
      logGroupName,
      logStreamName,
      logEvents,
    });

    await this.cloudWatchClient.send(command);
  }
}

const cloudWatchLogsClient = new CloudWatchLogsClientWrapper();
export default cloudWatchLogsClient;

