import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type SpanProcessor
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { TracingConfigureOptions, TracingOptions } from './types';

type OtlpTraceExporterConfig = ConstructorParameters<typeof OTLPTraceExporter>[0];
type OtelTracingState = {
  configured: boolean;
  configurePromise: Promise<void> | null;
  tracerProvider: NodeTracerProvider | null;
  extraSpanProcessors: SpanProcessor[];
  defaultTracerName: string;
  defaultTracerVersion: string | undefined;
};

// instrumentation 与 API 路由会编出两份模块实例，模块级变量互不可见。
const otelTracingGlobal = globalThis as typeof globalThis & {
  otelTracingState?: OtelTracingState;
};
const otelTracingState: OtelTracingState = (otelTracingGlobal.otelTracingState ??= {
  configured: false,
  configurePromise: null,
  tracerProvider: null,
  extraSpanProcessors: [],
  defaultTracerName: 'fastgpt',
  defaultTracerVersion: undefined
});

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
  if (otelTracingState.configured) return;
  if (otelTracingState.configurePromise) return otelTracingState.configurePromise;

  otelTracingState.configurePromise = (async () => {
    const tracingOptions = normalizeTracingOptions(options.tracing);
    otelTracingState.defaultTracerName =
      options.defaultTracerName ?? otelTracingState.defaultTracerName;
    otelTracingState.defaultTracerVersion =
      options.defaultTracerVersion ?? otelTracingState.defaultTracerVersion;

    if (!tracingOptions.enabled) {
      otelTracingState.configured = true;
      return;
    }

    const resource = defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]:
          tracingOptions.serviceName ??
          getEnvironmentVariable('OTEL_SERVICE_NAME') ??
          otelTracingState.defaultTracerName
      }).merge(tracingOptions.additionalResource ?? null)
    );

    const spanProcessors: SpanProcessor[] = [...otelTracingState.extraSpanProcessors];

    if (hasOtlpEndpoint(tracingOptions.otlpExporterConfig)) {
      const exporter = new OTLPTraceExporter({
        ...tracingOptions.otlpExporterConfig,
        url: resolveOtlpTracesUrl(tracingOptions.otlpExporterConfig)
      });

      spanProcessors.push(new BatchSpanProcessor(exporter));
    }

    otelTracingState.tracerProvider = new NodeTracerProvider({
      resource,
      sampler: new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(tracingOptions.sampleRatio)
      }),
      spanProcessors
    });

    otelTracingState.tracerProvider.register();

    otelTracingState.configured = true;
  })();

  try {
    await otelTracingState.configurePromise;
  } catch (error) {
    otelTracingState.configurePromise = null;
    throw error;
  }
}

/** 注册额外的 span processor；相同实例重复注册时保持幂等。 */
export function addSpanProcessor(processor: SpanProcessor): void {
  if (otelTracingState.extraSpanProcessors.includes(processor)) return;
  if (otelTracingState.tracerProvider) {
    throw new Error('addSpanProcessor must be called before tracing is configured');
  }
  otelTracingState.extraSpanProcessors.push(processor);
}

export async function disposeTracing() {
  if (otelTracingState.configurePromise) {
    try {
      await otelTracingState.configurePromise;
    } catch {
      otelTracingState.configurePromise = null;
      return;
    }
  }

  if (!otelTracingState.configured) return;

  if (!otelTracingState.tracerProvider) {
    const processors = otelTracingState.extraSpanProcessors;
    otelTracingState.configured = false;
    otelTracingState.configurePromise = null;
    otelTracingState.extraSpanProcessors = [];
    await Promise.all(processors.map((processor) => processor.shutdown()));
    return;
  }

  await otelTracingState.tracerProvider.shutdown();

  otelTracingState.configured = false;
  otelTracingState.configurePromise = null;
  otelTracingState.tracerProvider = null;
  otelTracingState.extraSpanProcessors = [];
}

export function getTracer(
  name = otelTracingState.defaultTracerName,
  version = otelTracingState.defaultTracerVersion
) {
  return trace.getTracer(name, version);
}

export function getCurrentSpanContext() {
  return trace.getActiveSpan()?.spanContext();
}
