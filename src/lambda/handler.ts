import { runBirthdayCheck } from '../services/birthday-orchestrator.service.js';
import { AlertingService } from '../services/alerting.service.js';
import { MetricsCollector } from '../services/metrics.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import calendarClient from '../clients/google-calendar.client.js';
import xrayClient from '../clients/xray.client.js';
import cloudWatchMetricsClient from '../clients/cloudwatch.client.js';
import snsClient from '../clients/sns.client.js';
import { setCorrelationId } from '../utils/runtime.util.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse | void> {

  const alerting = new AlertingService(logger, config, snsClient);
  const metrics = new MetricsCollector(logger, config, cloudWatchMetricsClient);
  
  const correlationId = context.awsRequestId;
  if (correlationId) {
    setCorrelationId(correlationId);
  }

  // Determine invocation source - EventBridge events have 'source' field, manual invokes don't
  const isManualInvoke = !event.source || event.source === '';
  const eventSource = isManualInvoke ? 'manual-invoke' : event.source;
  const eventType = isManualInvoke ? 'ManualInvocation' : (event['detail-type'] || 'Unknown');
  
  // Add X-Ray annotations
  xrayClient.addAnnotation('eventSource', eventSource);
  xrayClient.addAnnotation('eventType', eventType);
  xrayClient.addAnnotation('isManualInvoke', String(isManualInvoke));
  xrayClient.addMetadata('functionName', context.functionName);
  xrayClient.addMetadata('requestId', context.awsRequestId);
  xrayClient.addMetadata('remainingTime', context.getRemainingTimeInMillis());
  
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
    await runBirthdayCheck(logger, config, calendarClient, xrayClient, cloudWatchMetricsClient);
    
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

