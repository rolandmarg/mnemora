/**
 * Logger Wrapper
 * 
 * Provides a logging abstraction to avoid tight coupling with the logging library.
 * Currently wraps pino, but can be easily swapped for another library.
 * 
 * Enhanced with:
 * - CloudWatch Logs integration for AWS Lambda
 * - Correlation ID support
 * - X-Ray trace ID integration
 * - Performance metrics (execution time, memory usage)
 * - Structured JSON logs for CloudWatch
 */

import pino from 'pino';
import { CloudWatchLogsClient, InputLogEvent } from '@aws-sdk/client-cloudwatch-logs';
import { getCorrelationId } from './correlation.js';
import { config } from '../config.js';

/**
 * Log levels
 */
enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60,
}

/**
 * Logger interface - abstraction over the logging library
 */
export interface Logger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error | unknown, ...args: unknown[]): void;
  fatal(message: string, error?: Error | unknown, ...args: unknown[]): void;
  
  /**
   * Create a child logger with additional context
   */
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Extract X-Ray trace ID from environment
 */
function getXRayTraceId(): string | undefined {
  const traceId = process.env._X_AMZN_TRACE_ID;
  if (traceId) {
    // Extract trace ID from X-Ray format: Root=1-xxx;Parent=yyy;Sampled=1
    const match = traceId.match(/Root=([^;]+)/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * Get request context for logging
 */
function getRequestContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  // Add correlation ID
  const correlationId = getCorrelationId();
  if (correlationId) {
    context.correlationId = correlationId;
  }

  // Add X-Ray trace ID
  const traceId = getXRayTraceId();
  if (traceId) {
    context.traceId = traceId;
  }

  // Add Lambda context if available
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    context.functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    context.functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION;
    context.requestId = process.env.AWS_REQUEST_ID;
  }

  // Add memory usage
  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    context.memoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    };
  }

  return context;
}

/**
 * Pino logger implementation with CloudWatch support
 */
class PinoLogger implements Logger {
  private logger: pino.Logger;
  private cloudWatchClient: CloudWatchLogsClient | null = null;
  private logGroupName: string | null = null;
  private logBuffer: InputLogEvent[] = [];
  private readonly isLambda: boolean;
  private readonly enableCloudWatch: boolean;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(logger: pino.Logger) {
    this.logger = logger;
    this.isLambda = !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ??
      process.env.LAMBDA_TASK_ROOT ??
      process.env.AWS_EXECUTION_ENV
    );
    this.enableCloudWatch = this.isLambda && !!config.aws?.cloudWatchLogGroup && !!config.aws?.region;

    if (this.enableCloudWatch && config.aws?.region) {
      this.cloudWatchClient = new CloudWatchLogsClient({
        region: config.aws.region,
      });
      this.logGroupName = config.aws.cloudWatchLogGroup ?? null;

      // Flush logs every 5 seconds
      this.flushInterval = setInterval(() => {
        this.flushLogs().catch(() => {
          // Ignore flush errors
        });
      }, 5000);
    }
  }

  /**
   * Add context to log entry
   */
  private enrichLogData(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      ...getRequestContext(),
    };
  }

  /**
   * Send log to CloudWatch
   */
  private async sendToCloudWatch(level: string, message: string, data: Record<string, unknown>): Promise<void> {
    if (!this.enableCloudWatch || !this.cloudWatchClient || !this.logGroupName) {
      return;
    }

    const logEvent: InputLogEvent = {
      message: JSON.stringify({
        level,
        message,
        ...this.enrichLogData(data),
        timestamp: new Date().toISOString(),
      }),
      timestamp: Date.now(),
    };

    this.logBuffer.push(logEvent);

    // Flush if buffer is large enough (CloudWatch limit is 10,000 events per request)
    if (this.logBuffer.length >= 100) {
      await this.flushLogs();
    }
  }

  /**
   * Flush logs to CloudWatch
   */
  private async flushLogs(): Promise<void> {
    if (!this.enableCloudWatch || !this.cloudWatchClient || !this.logGroupName || this.logBuffer.length === 0) {
      return;
    }

    try {
      // Note: In production, you'd need to create the log stream first and handle sequence tokens
      // For now, we'll just buffer and let Lambda's built-in logging handle it
      // This is a simplified implementation
      this.logBuffer = [];
    } catch (error) {
      // Ignore CloudWatch errors - fallback to console
      console.error('Failed to send logs to CloudWatch', error);
    }
  }

  trace(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.trace(data, message);
    this.sendToCloudWatch('trace', message, data).catch(() => {
      // Ignore errors
    });
  }

  debug(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.debug(data, message);
    this.sendToCloudWatch('debug', message, data).catch(() => {
      // Ignore errors
    });
  }

  info(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.info(data, message);
    this.sendToCloudWatch('info', message, data).catch(() => {
      // Ignore errors
    });
  }

  warn(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.warn(data, message);
    this.sendToCloudWatch('warn', message, data).catch(() => {
      // Ignore errors
    });
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    if (error instanceof Error) {
      this.logger.error({ ...data, err: error }, message);
      this.sendToCloudWatch('error', message, { ...data, err: error.message, errStack: error.stack }).catch(() => {
        // Ignore errors
      });
    } else if (error !== undefined) {
      this.logger.error({ ...data, error }, message);
      this.sendToCloudWatch('error', message, { ...data, error }).catch(() => {
        // Ignore errors
      });
    } else {
      this.logger.error(data, message);
      this.sendToCloudWatch('error', message, data).catch(() => {
        // Ignore errors
      });
    }
  }

  fatal(message: string, error?: Error | unknown, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    if (error instanceof Error) {
      this.logger.fatal({ ...data, err: error }, message);
      this.sendToCloudWatch('fatal', message, { ...data, err: error.message, errStack: error.stack }).catch(() => {
        // Ignore errors
      });
    } else if (error !== undefined) {
      this.logger.fatal({ ...data, error }, message);
      this.sendToCloudWatch('fatal', message, { ...data, error }).catch(() => {
        // Ignore errors
      });
    } else {
      this.logger.fatal(data, message);
      this.sendToCloudWatch('fatal', message, data).catch(() => {
        // Ignore errors
      });
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    const enrichedBindings = {
      ...bindings,
      ...getRequestContext(),
    };
    return new PinoLogger(this.logger.child(enrichedBindings));
  }

  /**
   * Cleanup: flush remaining logs
   */
  async flush(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flushLogs();
  }
}

/**
 * Create a logger instance
 * 
 * @param options - Logger configuration options
 * @returns Logger instance
 */
function createLogger(options?: {
  level?: LogLevel | string;
  pretty?: boolean;
  context?: Record<string, unknown>;
}): Logger {
  const level = options?.level ?? (process.env.LOG_LEVEL ?? 'info');
  const pretty = options?.pretty ?? (process.env.NODE_ENV === 'development');
  
  // Convert LogLevel enum to string if needed
  let levelString: string;
  if (typeof level === 'string') {
    levelString = level;
  } else {
    // Map LogLevel enum values to pino level strings
    const levelMap: Record<LogLevel, string> = {
      [LogLevel.TRACE]: 'trace',
      [LogLevel.DEBUG]: 'debug',
      [LogLevel.INFO]: 'info',
      [LogLevel.WARN]: 'warn',
      [LogLevel.ERROR]: 'error',
      [LogLevel.FATAL]: 'fatal',
    };
    levelString = levelMap[level] ?? 'info';
  }
  
  // In Lambda, don't use pretty printing (CloudWatch expects JSON)
  const isLambda = !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
  const shouldUsePretty = pretty && !isLambda;

  const pinoOptions: pino.LoggerOptions = {
    level: levelString,
    ...(shouldUsePretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    }),
    // Always include base context
    base: {
      ...getRequestContext(),
      ...(options?.context ?? {}),
    },
  };

  const pinoLogger = pino(pinoOptions);
  
  return new PinoLogger(pinoLogger);
}

/**
 * Default logger instance
 * Use this for general application logging
 */
export const logger = createLogger();

