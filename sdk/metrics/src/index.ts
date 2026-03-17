export { configureMetrics, disposeMetrics, getMeter } from './client';
export { configureMetricsFromEnv, createMetricsOptionsFromEnv } from './env';
export type {
  MetricAttributeValue,
  MetricAttributes,
  MetricsConfigureOptions,
  MetricsOptions
} from './types';
export type { MetricsConfigureFromEnvOptions, MetricsEnv, MetricsEnvValue } from './env';
