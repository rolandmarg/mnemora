/**
 * Logger Wrapper
 * 
 * Provides a logging abstraction to avoid tight coupling with the logging library.
 * Currently wraps pino, but can be easily swapped for another library.
 */

import pino from 'pino';

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
 * Pino logger implementation
 */
class PinoLogger implements Logger {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  trace(message: string, ...args: unknown[]): void {
    this.logger.trace({ args }, message);
  }

  debug(message: string, ...args: unknown[]): void {
    this.logger.debug({ args }, message);
  }

  info(message: string, ...args: unknown[]): void {
    this.logger.info({ args }, message);
  }

  warn(message: string, ...args: unknown[]): void {
    this.logger.warn({ args }, message);
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (error instanceof Error) {
      this.logger.error({ err: error, args }, message);
    } else if (error !== undefined) {
      this.logger.error({ error, args }, message);
    } else {
      this.logger.error({ args }, message);
    }
  }

  fatal(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (error instanceof Error) {
      this.logger.fatal({ err: error, args }, message);
    } else if (error !== undefined) {
      this.logger.fatal({ error, args }, message);
    } else {
      this.logger.fatal({ args }, message);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    return new PinoLogger(this.logger.child(bindings));
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
  const level = options?.level ?? (process.env.LOG_LEVEL || 'info');
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
  
  const pinoOptions: pino.LoggerOptions = {
    level: levelString,
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    }),
  };

  const pinoLogger = pino(pinoOptions);
  
  if (options?.context) {
    return new PinoLogger(pinoLogger.child(options.context));
  }
  
  return new PinoLogger(pinoLogger);
}

/**
 * Default logger instance
 * Use this for general application logging
 */
export const logger = createLogger();

