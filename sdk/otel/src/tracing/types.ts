import type { Resource } from '@opentelemetry/resources';

export type TracingOptions = {
  enabled?: boolean;
  serviceName?: string;
  url?: string;
  headers?: Record<string, string>;
  sampleRatio?: number;
  additionalResource?: Resource | null;
};

export type TracingConfigureOptions = {
  defaultTracerName?: string;
  defaultTracerVersion?: string;
  tracing?: false | TracingOptions;
};

export type TraceAttributeValue = string | number | boolean;
export type TraceAttributes = Record<string, TraceAttributeValue>;
