import { runBirthdayCheck } from '../services/birthday-orchestrator.service.js';
import { sendLambdaExecutionFailedAlert, sendLambdaTimeoutAlert } from '../services/alerting.service.js';
import { logger } from '../clients/logger.client.js';
import { metrics } from '../services/metrics.service.js';
import { setCorrelationId } from '../utils/correlation.util.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse | void> {
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

  const timeoutWarning = setTimeout(() => {
    const remaining = context.getRemainingTimeInMillis();
    if (remaining < 60000) {
      logger.warn('Lambda execution approaching timeout', {
        remainingTime: remaining,
        requestId: context.awsRequestId,
      });
    }
  }, (context.getRemainingTimeInMillis() - 60000));

  try {
    await runBirthdayCheck();
    
    clearTimeout(timeoutWarning);

    logger.info('Lambda function completed successfully', {
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    });

    await metrics.flush();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Birthday check completed successfully',
        requestId: context.awsRequestId,
      }),
    };
  } catch (error) {
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
      sendLambdaExecutionFailedAlert(error, {
        requestId: context.awsRequestId,
        functionName: context.functionName,
        remainingTime,
      });
    }

    try {
      await metrics.flush();
    } catch (flushError) {
      logger.error('Error flushing metrics', flushError);
    }

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

