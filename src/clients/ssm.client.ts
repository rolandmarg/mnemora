import { SSMClient, GetParameterCommand, GetParametersCommand, type GetParameterCommandInput, type GetParametersCommandInput } from '@aws-sdk/client-ssm';
import { config } from '../config.js';

class SSMClientWrapper {
  private ssmClient: SSMClient | null = null;
  private readonly region: string;

  constructor() {
    this.region = config.aws.region;

    // Initialize SSM client if region is available (works in both Lambda and local)
    if (this.region) {
      this.ssmClient = new SSMClient({
        region: this.region,
      });
    }
  }

  isAvailable(): boolean {
    return this.ssmClient !== null;
  }

  async getParameter(name: string, decrypt: boolean = false): Promise<string | null> {
    if (!this.ssmClient) {
      throw new Error('SSM client not initialized. Check AWS_REGION environment variable.');
    }

    try {
      const input: GetParameterCommandInput = {
        Name: name,
        WithDecryption: decrypt,
      };

      const response = await this.ssmClient.send(new GetParameterCommand(input));
      return response.Parameter?.Value ?? null;
    } catch (error: unknown) {
      const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (awsError.name === 'ParameterNotFound' || awsError.$metadata?.httpStatusCode === 400) {
        return null;
      }
      throw error;
    }
  }

  async getParameters(names: string[], decrypt: boolean = false): Promise<Record<string, string>> {
    if (!this.ssmClient) {
      throw new Error('SSM client not initialized. Check AWS_REGION environment variable.');
    }

    if (names.length === 0) {
      return {};
    }

    try {
      const input: GetParametersCommandInput = {
        Names: names,
        WithDecryption: decrypt,
      };

      const response = await this.ssmClient.send(new GetParametersCommand(input));
      
      const result: Record<string, string> = {};
      if (response.Parameters) {
        for (const param of response.Parameters) {
          if (param.Name && param.Value) {
            result[param.Name] = param.Value;
          }
        }
      }

      return result;
    } catch (error: unknown) {
      const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (awsError.name === 'InvalidParameters' || awsError.$metadata?.httpStatusCode === 400) {
        return {};
      }
      throw error;
    }
  }
}

const ssmClient = new SSMClientWrapper();
export default ssmClient;

