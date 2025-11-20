import { AlertingService } from '../services/alerting.service.js';
import { appContext } from '../app-context.js';
import { setCorrelationId } from '../utils/correlation.util.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse> {

  const alerting = new AlertingService(appContext);
  
  const correlationId = context.awsRequestId;
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  appContext.logger.info('Daily summary handler invoked', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    eventSource: event.source,
  });

  try {
    await alerting.sendDailySummary();

    appContext.logger.info('Daily summary handler completed successfully', {
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
    appContext.logger.error('Daily summary handler failed', error, {
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

