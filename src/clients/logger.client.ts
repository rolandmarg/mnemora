import pino from 'pino';
import type { InputLogEvent } from '@aws-sdk/client-cloudwatch-logs';
import cloudWatchLogsClient from './cloudwatch-logs.client.js';
import { config } from '../config.js';
import { getCorrelationId } from '../utils/correlation.util.js';
import type { Logger } from '../types/logger.types.js';

enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60,
}

function getXRayTraceId(): string | undefined {
  const traceId = process.env._X_AMZN_TRACE_ID;
  if (traceId) {
    const match = traceId.match(/Root=([^;]+)/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function getRequestContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  const correlationId = getCorrelationId();
  if (correlationId) {
    context.correlationId = correlationId;
  }

  const traceId = getXRayTraceId();
  if (traceId) {
    context.traceId = traceId;
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    context.functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    context.functionVersion = process.env.AWS_LAMBDA_FUNCTION_VERSION;
    context.requestId = process.env.AWS_REQUEST_ID;
  }

  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    context.memoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    };
  }

  return context;
}

class PinoLogger implements Logger {
  private logger: pino.Logger;
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

    if (this.enableCloudWatch) {
      this.logGroupName = config.aws.cloudWatchLogGroup ?? null;
      this.flushInterval = setInterval(() => {
        this.flushLogs().catch(() => {});
      }, 5000);
    }
  }

  private enrichLogData(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      ...getRequestContext(),
    };
  }

  private async sendToCloudWatch(level: string, message: string, data: Record<string, unknown>): Promise<void> {
    if (!this.enableCloudWatch || !cloudWatchLogsClient.isAvailable() || !this.logGroupName) {
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

    if (this.logBuffer.length >= 100) {
      await this.flushLogs();
    }
  }

  private async flushLogs(): Promise<void> {
    if (!this.enableCloudWatch || !cloudWatchLogsClient.isAvailable() || !this.logGroupName || this.logBuffer.length === 0) {
      return;
    }

    try {
      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to send logs to CloudWatch', error);
    }
  }

  trace(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.trace(data, message);
    this.sendToCloudWatch('trace', message, data).catch(() => {});
  }

  debug(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.debug(data, message);
    this.sendToCloudWatch('debug', message, data).catch(() => {});
  }

  info(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.info(data, message);
    this.sendToCloudWatch('info', message, data).catch(() => {});
  }

  warn(message: string, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    this.logger.warn(data, message);
    this.sendToCloudWatch('warn', message, data).catch(() => {});
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    if (error instanceof Error) {
      this.logger.error({ ...data, err: error }, message);
      this.sendToCloudWatch('error', message, { ...data, err: error.message, errStack: error.stack }).catch(() => {});
    } else if (error !== undefined) {
      this.logger.error({ ...data, error }, message);
      this.sendToCloudWatch('error', message, { ...data, error }).catch(() => {});
    } else {
      this.logger.error(data, message);
      this.sendToCloudWatch('error', message, data).catch(() => {});
    }
  }

  fatal(message: string, error?: Error | unknown, ...args: unknown[]): void {
    const data = this.enrichLogData({ args });
    if (error instanceof Error) {
      this.logger.fatal({ ...data, err: error }, message);
      this.sendToCloudWatch('fatal', message, { ...data, err: error.message, errStack: error.stack }).catch(() => {});
    } else if (error !== undefined) {
      this.logger.fatal({ ...data, error }, message);
      this.sendToCloudWatch('fatal', message, { ...data, error }).catch(() => {});
    } else {
      this.logger.fatal(data, message);
      this.sendToCloudWatch('fatal', message, data).catch(() => {});
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    const enrichedBindings = {
      ...bindings,
      ...getRequestContext(),
    };
    return new PinoLogger(this.logger.child(enrichedBindings));
  }

  async flush(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flushLogs();
  }
}

function createLogger(options?: {
  level?: LogLevel | string;
  pretty?: boolean;
  context?: Record<string, unknown>;
}): Logger {
  const level = options?.level ?? (process.env.LOG_LEVEL ?? 'info');
  const pretty = options?.pretty ?? (process.env.NODE_ENV === 'development');
  
  let levelString: string;
  if (typeof level === 'string') {
    levelString = level;
  } else {
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
    base: {
      ...getRequestContext(),
      ...(options?.context ?? {}),
    },
  };

  const pinoLogger = pino(pinoOptions);
  
  return new PinoLogger(pinoLogger);
}

export const logger = createLogger();

