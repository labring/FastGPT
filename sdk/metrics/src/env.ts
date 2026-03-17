import { configureMetrics } from './client';
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

function parseBoolean(value: MetricsEnvValue, defaultValue: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string' || !value) return defaultValue;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return defaultValue;
}

function parseNumber(value: MetricsEnvValue, defaultValue: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return defaultValue;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseString(value: MetricsEnvValue): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createMetricsOptionsFromEnv(
  options: MetricsConfigureFromEnvOptions = {}
): MetricsConfigureOptions {
  const env = options.env ?? process.env;

  const metricsExporter = parseString(env.OTEL_METRICS_EXPORTER)?.toLowerCase();
  const enabled = parseBoolean(
    env.METRICS_ENABLE_OTEL,
    metricsExporter === 'otlp' || options.defaultMetricsEnabled === true
  );

  return {
    defaultMeterName: options.defaultMeterName ?? options.defaultServiceName ?? 'fastgpt',
    metrics: enabled
      ? {
          enabled: true,
          serviceName:
            parseString(env.METRICS_OTEL_SERVICE_NAME) ??
            parseString(env.OTEL_SERVICE_NAME) ??
            options.defaultServiceName,
          url:
            parseString(env.METRICS_OTEL_URL) ??
            parseString(env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT) ??
            options.defaultMetricsUrl,
          exportIntervalMillis: parseNumber(
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
