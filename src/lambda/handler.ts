/**
 * AWS Lambda Handler
 * 
 * Entry point for Lambda function execution
 * Handles EventBridge events for scheduled birthday checks
 */

import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { setCorrelationId } from '../utils/correlation.js';
import { metrics } from '../utils/metrics.js';
import { runBirthdayCheck } from '../index-core.js';
import { sendLambdaExecutionFailedAlert, sendLambdaTimeoutAlert } from '../utils/alerting.js';

/**
 * Lambda handler function
 * 
 * @param event - EventBridge event
 * @param context - Lambda context
 * @returns Response or void
 */
export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse | void> {
  // Initialize correlation ID from request ID
  const correlationId = context.awsRequestId;
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  logger.info('Lambda function invoked', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    eventSource: event.source,
    eventType: event['detail-type'],
    remainingTime: context.getRemainingTimeInMillis(),
  });

  // Set up timeout detection
  const timeoutWarning = setTimeout(() => {
    const remaining = context.getRemainingTimeInMillis();
    if (remaining < 60000) { // Less than 1 minute remaining
      logger.warn('Lambda execution approaching timeout', {
        remainingTime: remaining,
        requestId: context.awsRequestId,
      });
    }
  }, (context.getRemainingTimeInMillis() - 60000)); // Warn 1 minute before timeout

  try {
    // Run the birthday check
    await runBirthdayCheck();
    
    // Clear timeout warning
    clearTimeout(timeoutWarning);

    logger.info('Lambda function completed successfully', {
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    });

    // Flush metrics before returning
    await metrics.flush();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Birthday check completed successfully',
        requestId: context.awsRequestId,
      }),
    };
  } catch (error) {
    // Clear timeout warning
    clearTimeout(timeoutWarning);
    
    logger.error('Lambda function failed', error, {
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    });

    // Check if this is a timeout error
    const remainingTime = context.getRemainingTimeInMillis();
    if (remainingTime <= 0 || (error instanceof Error && error.message.includes('timeout'))) {
      sendLambdaTimeoutAlert({
        requestId: context.awsRequestId,
        functionName: context.functionName,
        remainingTime,
      });
    } else {
      // Send execution failed alert
      sendLambdaExecutionFailedAlert(error, {
        requestId: context.awsRequestId,
        functionName: context.functionName,
        remainingTime,
      });
    }

    // Flush metrics even on error
    try {
      await metrics.flush();
    } catch (flushError) {
      logger.error('Error flushing metrics', flushError);
    }

    // Return error response
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Birthday check failed',
        error: error instanceof Error ? error.message : String(error),
        requestId: context.awsRequestId,
      }),
    };
  }
}

