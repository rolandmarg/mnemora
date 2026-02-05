import { runBirthdayCheck } from '../services/birthday.js';
import { logger } from '../utils/logger.util.js';
import { setCorrelationId } from '../utils/runtime.util.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse | void> {
  const isManualInvoke = !event.source || event.source === '';

  if (context.awsRequestId) {
    setCorrelationId(context.awsRequestId);
  }

  logger.info('Lambda function invoked', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    eventSource: isManualInvoke ? 'manual-invoke' : event.source,
    remainingTime: context.getRemainingTimeInMillis(),
  });

  const timeoutWarning = setTimeout(() => {
    const remaining = context.getRemainingTimeInMillis();
    if (remaining < 60000) {
      logger.warn('Lambda approaching timeout', { remainingTime: remaining });
    }
  }, context.getRemainingTimeInMillis() - 60000);

  try {
    await runBirthdayCheck(logger);
    clearTimeout(timeoutWarning);

    logger.info('Lambda completed successfully', {
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Birthday check completed',
        requestId: context.awsRequestId,
      }),
    };
  } catch (error) {
    clearTimeout(timeoutWarning);

    logger.error('Lambda function failed', error, {
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    });

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
