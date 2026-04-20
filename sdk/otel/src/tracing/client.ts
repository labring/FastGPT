import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { TracingConfigureOptions, TracingOptions } from './types';

type OtlpTraceExporterConfig = ConstructorParameters<typeof OTLPTraceExporter>[0];

let configured = false;
let configurePromise: Promise<void> | null = null;
let tracerProvider: NodeTracerProvider | null = null;
let defaultTracerName = 'fastgpt';
let defaultTracerVersion: string | undefined;

function getEnvironmentVariable(name: string): string | undefined {
  return process.env[name];
}

function hasOtlpEndpoint(config?: OtlpTraceExporterConfig): boolean {
  if (config?.url) return true;
  if (getEnvironmentVariable('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT')) return true;
  if (getEnvironmentVariable('OTEL_EXPORTER_OTLP_ENDPOINT')) return true;
  return false;
}

function normalizeOtlpTracesUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.endsWith('/v1/traces')) return trimmed;
  return `${trimmed.replace(/\/+$/, '')}/v1/traces`;
}

function resolveOtlpTracesUrl(config?: OtlpTraceExporterConfig) {
  if (config?.url) return config.url;

  const tracesEndpoint = getEnvironmentVariable('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT');
  if (tracesEndpoint) return tracesEndpoint;

  const endpoint = getEnvironmentVariable('OTEL_EXPORTER_OTLP_ENDPOINT');
  if (endpoint) return normalizeOtlpTracesUrl(endpoint);

  return undefined;
}

function normalizeSampleRatio(value: number | undefined, defaultValue: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultValue;
  return Math.max(0, Math.min(1, value));
}

function normalizeTracingOptions(options?: false | TracingOptions) {
  if (options === false) {
    return {
      enabled: false,
      sampleRatio: 1
    };
  }

  return {
    enabled: options?.enabled ?? false,
    serviceName: options?.serviceName,
    sampleRatio: normalizeSampleRatio(options?.sampleRatio, 1),
    otlpExporterConfig: {
      url: options?.url,
      headers: options?.headers
    } satisfies OtlpTraceExporterConfig,
    additionalResource: options?.additionalResource ?? null
  };
}

export async function configureTracing(options: TracingConfigureOptions = {}) {
  if (configured) return;
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    const tracingOptions = normalizeTracingOptions(options.tracing);
    defaultTracerName = options.defaultTracerName ?? defaultTracerName;
    defaultTracerVersion = options.defaultTracerVersion ?? defaultTracerVersion;

    if (!tracingOptions.enabled) {
      configured = true;
      return;
    }

    const resource = defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]:
          tracingOptions.serviceName ??
          getEnvironmentVariable('OTEL_SERVICE_NAME') ??
          defaultTracerName
      }).merge(tracingOptions.additionalResource ?? null)
    );

    const spanProcessors = [];

    if (hasOtlpEndpoint(tracingOptions.otlpExporterConfig)) {
      const exporter = new OTLPTraceExporter({
        ...tracingOptions.otlpExporterConfig,
        url: resolveOtlpTracesUrl(tracingOptions.otlpExporterConfig)
      });

      spanProcessors.push(new BatchSpanProcessor(exporter));
    }

    tracerProvider = new NodeTracerProvider({
      resource,
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(tracingOptions.sampleRatio)
      }),
      spanProcessors
    });

    tracerProvider.register();

    configured = true;
  })();

  try {
    await configurePromise;
  } catch (error) {
    configurePromise = null;
    throw error;
  }
}

export async function disposeTracing() {
  if (configurePromise) {
    try {
      await configurePromise;
    } catch {
      configurePromise = null;
      return;
    }
  }

  if (!configured) return;

  if (!tracerProvider) {
    configured = false;
    configurePromise = null;
    return;
  }

  await tracerProvider.shutdown();

  configured = false;
  configurePromise = null;
  tracerProvider = null;
}

export function getTracer(name = defaultTracerName, version = defaultTracerVersion) {
  return trace.getTracer(name, version);
}

export function getCurrentSpanContext() {
  return trace.getActiveSpan()?.spanContext();
}
