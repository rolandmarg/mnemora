import { runBirthdayCheck } from '../services/birthday-orchestrator.service.js';
import { AlertingService } from '../services/alerting.service.js';
import { MetricsCollector } from '../services/metrics.service.js';
import { logger } from '../utils/logger.util.js';
import { config } from '../config.js';
import GoogleCalendarClient from '../clients/google-calendar.client.js';
import xrayClient from '../clients/xray.client.js';
import cloudWatchClient from '../clients/cloudwatch.client.js';
import whatsappClient from '../clients/whatsapp.client.js';
import snsClient from '../clients/sns.client.js';
import { setCorrelationId } from '../utils/runtime.util.js';
import { QRAuthenticationRequiredError } from '../types/qr-auth-error.js';
import type { EventBridgeEvent, LambdaContext, LambdaResponse } from './types.js';

export async function handler(
  event: EventBridgeEvent,
  context: LambdaContext
): Promise<LambdaResponse | void> {
  // Determine invocation source - EventBridge events have 'source' field, manual invokes don't
  const isManualInvoke = !event.source || event.source === '';
  const eventSource = isManualInvoke ? 'manual-invoke' : event.source;
  const eventType = isManualInvoke ? 'ManualInvocation' : (event['detail-type'] || 'Unknown');

  // Wrap handler logic in a subsegment to allow X-Ray annotations
  // The main Lambda segment cannot be annotated directly - this is why we get the warning
  // By wrapping in a subsegment, we can add metadata and annotations properly
  return await xrayClient.captureAsyncSegment(
    'handler',
    async (_subsegment) => {
      const alerting = new AlertingService({ logger, config, snsClient });
      const metrics = new MetricsCollector({ logger, config, cloudWatchClient, alerting });
      
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
        const calendarClient = new GoogleCalendarClient(config, xrayClient);
        
        await runBirthdayCheck({
          logger,
          config,
          calendarClient,
          xrayClient,
          cloudWatchClient,
          whatsappClient,
          alerting,
        });
        
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

        const remainingTime = context.getRemainingTimeInMillis();
        
        // Check for specific error types first
        if (error instanceof QRAuthenticationRequiredError) {
          // QR authentication required - send specific alert
          // Note: WhatsApp channel already sends this alert, but we send it again here
          // to ensure it's sent even if the error bubbles up before the channel can send it
          alerting.sendWhatsAppAuthRequiredAlert({
            requestId: context.awsRequestId,
            functionName: context.functionName,
            qrCodeAvailable: true,
            environment: 'lambda',
            errorMessage: error.message,
          });
        } else if (remainingTime <= 0 || (error instanceof Error && error.message.includes('timeout'))) {
          // Timeout error
          alerting.sendLambdaTimeoutAlert({
            requestId: context.awsRequestId,
            functionName: context.functionName,
            remainingTime,
          });
        } else {
          // Generic execution failure
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
    },
    {
      eventSource,
      eventType,
      isManualInvoke: String(isManualInvoke),
      functionName: context.functionName,
      requestId: context.awsRequestId,
      remainingTime: context.getRemainingTimeInMillis(),
    }
  );
}

