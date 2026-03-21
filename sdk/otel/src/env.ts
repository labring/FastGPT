import {
  configureLoggerFromEnv,
  createLoggerOptionsFromEnv,
  type LoggerConfigureFromEnvOptions,
  type LoggerEnv
} from './logger';
import {
  configureMetricsFromEnv,
  createMetricsOptionsFromEnv,
  type MetricsConfigureFromEnvOptions,
  type MetricsEnv
} from './metrics';
import { configureTracingFromEnv, createTracingOptionsFromEnv } from './tracing';
import type { TracingConfigureFromEnvOptions, TracingEnv } from './tracing';
import type { OtelConfigureOptions } from './types';

type OtelEnv = LoggerEnv & MetricsEnv & TracingEnv;

export type OtelConfigureFromEnvOptions = {
  env?: OtelEnv;
  defaultServiceName?: string;
  logger?: Omit<LoggerConfigureFromEnvOptions, 'env' | 'defaultServiceName'>;
  metrics?: Omit<MetricsConfigureFromEnvOptions, 'env' | 'defaultServiceName'>;
  tracing?: Omit<TracingConfigureFromEnvOptions, 'env' | 'defaultServiceName'>;
};

export function createOtelOptionsFromEnv(
  options: OtelConfigureFromEnvOptions = {}
): OtelConfigureOptions {
  const env = options.env ?? process.env;

  return {
    logger: createLoggerOptionsFromEnv({
      env,
      defaultServiceName: options.defaultServiceName,
      ...options.logger
    }),
    metrics: createMetricsOptionsFromEnv({
      env,
      defaultServiceName: options.defaultServiceName,
      ...options.metrics
    }),
    tracing: createTracingOptionsFromEnv({
      env,
      defaultServiceName: options.defaultServiceName,
      ...options.tracing
    })
  };
}

export async function configureOtelFromEnv(options: OtelConfigureFromEnvOptions = {}) {
  const env = options.env ?? process.env;

  await Promise.all([
    configureLoggerFromEnv({
      env,
      defaultServiceName: options.defaultServiceName,
      ...options.logger
    }),
    configureMetricsFromEnv({
      env,
      defaultServiceName: options.defaultServiceName,
      ...options.metrics
    }),
    configureTracingFromEnv({
      env,
      defaultServiceName: options.defaultServiceName,
      ...options.tracing
    })
  ]);
}
