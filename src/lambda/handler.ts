import { runBirthdayCheck } from '../services/birthday-orchestrator.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import GoogleCalendarClient from '../clients/google-calendar.client.js';
import whatsappClient from '../clients/whatsapp.client.js';
import { setCorrelationId } from '../utils/runtime.util.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse | void> {
  // Determine invocation source - EventBridge events have 'source' field, manual invokes don't
  const isManualInvoke = !event.source || event.source === '';
  const eventSource = isManualInvoke ? 'manual-invoke' : event.source;
  const eventType = isManualInvoke ? 'ManualInvocation' : (event['detail-type'] || 'Unknown');

  const correlationId = context.awsRequestId;
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  logger.info('Lambda function invoked', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    eventSource,
    eventType,
    isManualInvoke,
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
    const calendarClient = new GoogleCalendarClient(config);

    await runBirthdayCheck({
      logger,
      config,
      calendarClient,
      whatsappClient,
    });

    clearTimeout(timeoutWarning);

    logger.info('Lambda function completed successfully', {
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    });

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
