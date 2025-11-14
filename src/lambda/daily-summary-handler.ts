/**
 * Daily Summary Lambda Handler
 * 
 * Runs daily at 10 PM to generate and send alert summaries
 * Only sends summary if there are active alerts
 */

import { logger } from '../utils/logger.js';
import { setCorrelationId } from '../utils/correlation.js';
import { alerting } from '../utils/alerting.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

/**
 * Lambda handler for daily summary
 * 
 * @param event - EventBridge event
 * @param context - Lambda context
 * @returns Response
 */
export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse> {
  // Initialize correlation ID from request ID
  const correlationId = context.awsRequestId;
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  logger.info('Daily summary handler invoked', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    eventSource: event.source,
  });

  try {
    // Generate and send daily summary
    await alerting.sendDailySummary();

    logger.info('Daily summary handler completed successfully', {
      requestId: context.awsRequestId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Daily summary sent successfully',
        requestId: context.awsRequestId,
      }),
    };
  } catch (error) {
    logger.error('Daily summary handler failed', error, {
      requestId: context.awsRequestId,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Daily summary failed',
        error: error instanceof Error ? error.message : String(error),
        requestId: context.awsRequestId,
      }),
    };
  }
}

