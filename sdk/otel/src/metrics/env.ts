import { configureMetrics } from './client';
import { parseBooleanEnv, parsePositiveNumberEnv, parseStringEnv } from '../env-utils';
import type { MetricsConfigureOptions } from './types';

export type MetricsEnvValue = string | boolean | number | undefined;
export type MetricsEnv = Record<string, MetricsEnvValue>;

export type MetricsConfigureFromEnvOptions = {
  env?: MetricsEnv;
  defaultServiceName?: string;
  defaultMeterName?: string;
  defaultMetricsEnabled?: boolean;
  defaultMetricsUrl?: string;
  defaultExportIntervalMillis?: number;
};

export function createMetricsOptionsFromEnv(
  options: MetricsConfigureFromEnvOptions = {}
): MetricsConfigureOptions {
  const env = options.env ?? process.env;

  const metricsExporter = parseStringEnv(env.OTEL_METRICS_EXPORTER)?.toLowerCase();
  const enabled = parseBooleanEnv(
    env.METRICS_ENABLE_OTEL,
    metricsExporter === 'otlp' || options.defaultMetricsEnabled === true
  );

  return {
    defaultMeterName: options.defaultMeterName ?? options.defaultServiceName ?? 'fastgpt',
    metrics: enabled
      ? {
          enabled: true,
          serviceName:
            parseStringEnv(env.METRICS_OTEL_SERVICE_NAME) ??
            parseStringEnv(env.OTEL_SERVICE_NAME) ??
            options.defaultServiceName,
          url:
            parseStringEnv(env.METRICS_OTEL_URL) ??
            parseStringEnv(env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT) ??
            options.defaultMetricsUrl,
          exportIntervalMillis: parsePositiveNumberEnv(
            env.METRICS_EXPORT_INTERVAL ?? env.OTEL_METRIC_EXPORT_INTERVAL,
            options.defaultExportIntervalMillis ?? 15000
          )
        }
      : false
  };
}

export async function configureMetricsFromEnv(options: MetricsConfigureFromEnvOptions = {}) {
  return configureMetrics(createMetricsOptionsFromEnv(options));
}
