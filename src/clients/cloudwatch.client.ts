import { CloudWatchClient, PutMetricDataCommand, type MetricDatum } from '@aws-sdk/client-cloudwatch';
import { config } from '../config.js';
import { isLambda } from '../utils/runtime.util.js';

class CloudWatchMetricsClient {
  private cloudWatchClient: CloudWatchClient | null = null;
  private readonly isLambda: boolean;

  constructor() {
    this.isLambda = isLambda();

    const region = config.aws.region;
    if (this.isLambda && region) {
      this.cloudWatchClient = new CloudWatchClient({
        region,
      });
    }
  }

  isAvailable(): boolean {
    return this.cloudWatchClient !== null;
  }

  async putMetricData(
    namespace: string,
    metricData: MetricDatum[]
  ): Promise<void> {
    if (!this.cloudWatchClient) {
      throw new Error('CloudWatch Metrics client not initialized. Check AWS_REGION environment variable.');
    }

    const command = new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: metricData,
    });

    await this.cloudWatchClient.send(command);
  }
}

const cloudWatchMetricsClient = new CloudWatchMetricsClient();
export default cloudWatchMetricsClient;

