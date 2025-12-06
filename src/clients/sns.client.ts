import { SNSClient, PublishCommand, type PublishCommandInput } from '@aws-sdk/client-sns';
import { config } from '../config.js';
import { isLambda } from '../utils/runtime.util.js';
import xrayClient from './xray.client.js';

class SNSClientWrapper {
  private snsClient: SNSClient | null = null;
  private readonly topicArn: string | undefined;
  private readonly isLambda: boolean;

  constructor() {
    this.isLambda = isLambda();
    this.topicArn = config.aws.snsTopicArn;

    const region = config.aws.region;
    // Initialize SNS client if we have topic ARN and region
    // Allow local testing when SNS_TOPIC_ARN is explicitly set
    if (this.topicArn && region) {
      this.snsClient = new SNSClient({
        region,
      });
    }
  }

  isAvailable(): boolean {
    return this.snsClient !== null && this.topicArn !== undefined;
  }

  async publish(
    subject: string,
    message: string,
    messageAttributes?: Record<string, { DataType: string; StringValue: string }>
  ): Promise<string> {
    if (!this.snsClient || !this.topicArn) {
      throw new Error('SNS client not initialized. Check SNS_TOPIC_ARN and AWS_REGION environment variables.');
    }

    return xrayClient.captureAsyncSegment('SNS.publish', async () => {
      const input: PublishCommandInput = {
        TopicArn: this.topicArn,
        Subject: subject,
        Message: message,
      };

      if (messageAttributes) {
        input.MessageAttributes = messageAttributes;
      }

      const response = await this.snsClient!.send(new PublishCommand(input));
      return response.MessageId ?? '';
    }, {
      topicArn: this.topicArn,
      subject,
      messageLength: message.length,
      hasAttributes: !!messageAttributes,
    });
  }

  async publishAlert(
    subject: string,
    message: string,
    severity: 'CRITICAL' | 'WARNING' | 'INFO',
    alertType: string,
    sendSMS: boolean = false
  ): Promise<string> {
    return xrayClient.captureAsyncSegment('SNS.publishAlert', async () => this.publish(subject, message, {
      Severity: {
        DataType: 'String',
        StringValue: severity,
      },
      AlertType: {
        DataType: 'String',
        StringValue: alertType,
      },
      SendSMS: {
        DataType: 'String',
        StringValue: sendSMS ? 'true' : 'false',
      },
    }), {
      severity,
      alertType,
      sendSMS,
      messageLength: message.length,
    });
  }
}

const snsClient = new SNSClientWrapper();
export default snsClient;

