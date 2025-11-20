import { runBirthdayCheck } from '../services/birthday-orchestrator.service.js';
import { AlertingService } from '../services/alerting.service.js';
import { MetricsCollector } from '../services/metrics.service.js';
import { appContext } from '../app-context.js';
import { loadDynamicConfig } from '../config.js';
import { setCorrelationId } from '../utils/correlation.util.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse | void> {
  // Load dynamic configuration from Parameter Store
  await loadDynamicConfig(appContext);

  const alerting = new AlertingService(appContext);
  const metrics = new MetricsCollector(appContext);
  
  const correlationId = context.awsRequestId;
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  appContext.logger.info('Lambda function invoked', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    eventSource: event.source,
    eventType: event['detail-type'],
    remainingTime: context.getRemainingTimeInMillis(),
  });

  const timeoutWarning = setTimeout(() => {
    const remaining = context.getRemainingTimeInMillis();
    if (remaining < 60000) {
      appContext.logger.warn('Lambda execution approaching timeout', {
        remainingTime: remaining,
        requestId: context.awsRequestId,
      });
    }
  }, (context.getRemainingTimeInMillis() - 60000));

  try {
    await runBirthdayCheck(appContext);
    
    clearTimeout(timeoutWarning);

    appContext.logger.info('Lambda function completed successfully', {
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
    
    appContext.logger.error('Lambda function failed', error, {
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    });

    // Check if this is a timeout error
    const remainingTime = context.getRemainingTimeInMillis();
    if (remainingTime <= 0 || (error instanceof Error && error.message.includes('timeout'))) {
      alerting.sendLambdaTimeoutAlert({
        requestId: context.awsRequestId,
        functionName: context.functionName,
        remainingTime,
      });
    } else {
      alerting.sendLambdaExecutionFailedAlert(error, {
        requestId: context.awsRequestId,
        functionName: context.functionName,
        remainingTime,
      });
    }

    try {
      await metrics.flush();
    } catch (flushError) {
      appContext.logger.error('Error flushing metrics', flushError);
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

