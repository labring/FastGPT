import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Config, LogLevel } from '@logtape/logtape';

export type LogCategory = readonly string[];
export type LoggerContext = Record<string, unknown>;
export type LoggerSinkId = 'console' | 'otel';

type FilterId = string;

export type LogTapeConfig<S extends string = LoggerSinkId, F extends string = FilterId> = Config<
  S,
  F
>;

export type LoggerConfig = LogTapeConfig['loggers'];

export type ConsoleLoggerOptions = {
  enabled?: boolean;
  level?: LogLevel;
};

export type OtelLoggerOptions = {
  enabled?: boolean;
  level?: LogLevel;
  serviceName: string;
  url?: string;
  loggerName?: string;
};

export type LoggerConfigureOptions = {
  console?: boolean | ConsoleLoggerOptions;
  otel?: false | OtelLoggerOptions;
  contextLocalStorage?: AsyncLocalStorage<LoggerContext>;
  loggers?: LoggerConfig;
  sensitiveProperties?: readonly string[];
  defaultCategory?: LogCategory;
};
