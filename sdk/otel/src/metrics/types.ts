import type { Resource } from '@opentelemetry/resources';

export type MetricsOptions = {
  enabled?: boolean;
  serviceName?: string;
  url?: string;
  headers?: Record<string, string>;
  exportIntervalMillis?: number;
  additionalResource?: Resource | null;
};

export type MetricsConfigureOptions = {
  defaultMeterName?: string;
  defaultMeterVersion?: string;
  metrics?: false | MetricsOptions;
};

export type MetricAttributeValue = string | number | boolean;
export type MetricAttributes = Record<string, MetricAttributeValue>;
