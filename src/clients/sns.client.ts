import { SNSClient, PublishCommand, type PublishCommandInput } from '@aws-sdk/client-sns';
import { appContext } from '../app-context.js';

class SNSClientWrapper {
  private snsClient: SNSClient | null = null;
  private readonly topicArn: string | undefined;
  private readonly isLambda: boolean;

  constructor() {
    const config = appContext.config;
    
    this.isLambda = !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ??
      process.env.LAMBDA_TASK_ROOT ??
      process.env.AWS_EXECUTION_ENV
    );
    this.topicArn = process.env.SNS_TOPIC_ARN;

    if (this.isLambda && this.topicArn && config.aws?.region) {
      this.snsClient = new SNSClient({
        region: config.aws.region,
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

    const input: PublishCommandInput = {
      TopicArn: this.topicArn,
      Subject: subject,
      Message: message,
    };

    if (messageAttributes) {
      input.MessageAttributes = messageAttributes;
    }

    const response = await this.snsClient.send(new PublishCommand(input));
    return response.MessageId ?? '';
  }

  async publishAlert(
    subject: string,
    message: string,
    severity: 'CRITICAL' | 'WARNING' | 'INFO',
    alertType: string,
    sendSMS: boolean = false
  ): Promise<string> {
    return this.publish(subject, message, {
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
    });
  }
}

const snsClient = new SNSClientWrapper();
export default snsClient;

