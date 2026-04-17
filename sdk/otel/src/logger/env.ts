import type { LogLevel } from '@logtape/logtape';
import { configureLogger } from './client';
import { parseBooleanEnv, parseStringEnv } from '../env-utils';
import type { LogCategory, LoggerConfigureOptions } from './types';

export type LoggerEnvValue = string | boolean | number | undefined;
export type LoggerEnv = Record<string, LoggerEnvValue>;

export type LoggerConfigureFromEnvOptions = {
  env?: LoggerEnv;
  defaultCategory?: LogCategory;
  defaultServiceName?: string;
  defaultLoggerName?: string;
  defaultConsoleEnabled?: boolean;
  defaultConsoleLevel?: LogLevel;
  defaultOtelEnabled?: boolean;
  defaultOtelLevel?: LogLevel;
  defaultOtelUrl?: string;
  sensitiveProperties?: readonly string[];
};

const logLevels = new Set<LogLevel>(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);

function parseLogLevel(value: LoggerEnvValue, defaultValue: LogLevel): LogLevel {
  if (typeof value !== 'string') return defaultValue;

  return logLevels.has(value as LogLevel) ? (value as LogLevel) : defaultValue;
}

export function createLoggerOptionsFromEnv(
  options: LoggerConfigureFromEnvOptions = {}
): LoggerConfigureOptions {
  const env = options.env ?? process.env;
  const defaultServiceName = options.defaultServiceName ?? 'app';
  const serviceName = parseStringEnv(env.LOG_OTEL_SERVICE_NAME) ?? defaultServiceName;
  const loggerName =
    parseStringEnv(env.LOG_OTEL_LOGGER_NAME) ?? options.defaultLoggerName ?? serviceName;

  return {
    defaultCategory: options.defaultCategory,
    console: {
      enabled: parseBooleanEnv(env.LOG_ENABLE_CONSOLE, options.defaultConsoleEnabled ?? true),
      level: parseLogLevel(env.LOG_CONSOLE_LEVEL, options.defaultConsoleLevel ?? 'trace')
    },
    otel: parseBooleanEnv(env.LOG_ENABLE_OTEL, options.defaultOtelEnabled ?? false)
      ? {
          serviceName,
          loggerName,
          url:
            parseStringEnv(env.LOG_OTEL_URL) ??
            options.defaultOtelUrl ??
            'http://localhost:4318/v1/logs',
          level: parseLogLevel(env.LOG_OTEL_LEVEL, options.defaultOtelLevel ?? 'warning')
        }
      : false,
    sensitiveProperties: options.sensitiveProperties
  };
}

export async function configureLoggerFromEnv(options: LoggerConfigureFromEnvOptions = {}) {
  return configureLogger(createLoggerOptionsFromEnv(options));
}
