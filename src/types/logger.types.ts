export interface Logger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: Error | unknown, ...args: unknown[]): void;
  fatal(message: string, error?: Error | unknown, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

