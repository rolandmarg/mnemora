import { AlertingService } from '../services/alerting.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import snsClient from '../clients/sns.client.js';
import { setCorrelationId } from '../utils/runtime.util.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse> {

  const alerting = new AlertingService(logger, config, snsClient);
  
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

