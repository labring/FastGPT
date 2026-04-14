// src/ports/logger.ts

import { ConsoleLogger } from '../builtIn/logger/consoleLogger';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  isLevelEnabled(level: LogLevel): boolean;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
  timestampFormat?: 'iso' | 'unix' | 'none';
}

export function createLogger(options?: Partial<LoggerOptions>): Logger {
  return new ConsoleLogger({
    level: options?.level ?? LogLevel.INFO,
    prefix: options?.prefix ?? 'AgenticRAG',
    timestampFormat: options?.timestampFormat ?? 'iso'
  });
}

export function createLoggerFromInstance(instance: Logger): Logger {
  return instance;
}
