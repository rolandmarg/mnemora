/**
 * Lambda Event and Context Types
 * 
 * Type definitions for AWS Lambda handler
 */

/**
 * EventBridge event structure
 */
export interface EventBridgeEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: Record<string, unknown>;
}

/**
 * Lambda context (simplified)
 */
export interface LambdaContext {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  getRemainingTimeInMillis(): number;
}

/**
 * Lambda response
 */
export interface LambdaResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * Lambda handler function type
 */
export type LambdaHandler = (
  event: EventBridgeEvent,
  context: LambdaContext
) => Promise<LambdaResponse | void>;

