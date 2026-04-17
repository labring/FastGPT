export { configureLogger, disposeLogger, getLogger } from './client';
export { withContext, withCategoryPrefix } from '@logtape/logtape';
export { getOpenTelemetrySink } from './otel';
export type {
  BodyFormatter,
  ExceptionAttributeMode,
  ObjectRenderer,
  OpenTelemetrySink,
  OpenTelemetrySinkOptions
} from './otel';
export type {
  ConsoleLoggerOptions,
  LogCategory,
  LoggerConfig,
  LoggerConfigureOptions,
  LoggerContext,
  LoggerSinkId,
  OtelLoggerOptions
} from './types';

export { configureLoggerFromEnv, createLoggerOptionsFromEnv } from './env';
export type { LoggerConfigureFromEnvOptions, LoggerEnv } from './env';
