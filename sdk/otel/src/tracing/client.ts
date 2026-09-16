import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type ReadableSpan,
  type SpanExporter,
  type SpanProcessor
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { TracingConfigureOptions, TracingOptions } from './types';

type OtlpTraceExporterConfig = ConstructorParameters<typeof OTLPTraceExporter>[0];

let configured = false;
let configurePromise: Promise<void> | null = null;
let tracerProvider: NodeTracerProvider | null = null;
let extraSpanProcessors: SpanProcessor[] = [];
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

    const spanProcessors: SpanProcessor[] = [...extraSpanProcessors];

    if (hasOtlpEndpoint(tracingOptions.otlpExporterConfig)) {
      const exporter = new OTLPTraceExporter({
        ...tracingOptions.otlpExporterConfig,
        url: resolveOtlpTracesUrl(tracingOptions.otlpExporterConfig)
      });

      // Langfuse 与通用追踪共用 span；只在 OTLP 出口裁剪，不能修改其他 processor 读取的原始数据。
      const otlpExporter: SpanExporter = {
        export(spans, callback) {
          const sanitizedSpans = spans.map((span) => {
            const sanitizedSpan = Object.create(span) as ReadableSpan;
            Object.defineProperty(sanitizedSpan, 'attributes', {
              value: Object.fromEntries(
                Object.entries(span.attributes).filter(([key]) => !key.startsWith('langfuse.'))
              )
            });
            return sanitizedSpan;
          });
          exporter.export(sanitizedSpans, callback);
        },
        shutdown: () => exporter.shutdown(),
        forceFlush: () => exporter.forceFlush()
      };

      spanProcessors.push(new BatchSpanProcessor(otlpExporter));
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

/** 注册额外的 span processor；相同实例重复注册时保持幂等。 */
export function addSpanProcessor(processor: SpanProcessor): void {
  if (extraSpanProcessors.includes(processor)) return;
  if (tracerProvider) {
    throw new Error('addSpanProcessor must be called before tracing is configured');
  }
  extraSpanProcessors.push(processor);
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
    extraSpanProcessors = [];
    return;
  }

  await tracerProvider.shutdown();

  configured = false;
  configurePromise = null;
  tracerProvider = null;
  extraSpanProcessors = [];
}

export function getTracer(name = defaultTracerName, version = defaultTracerVersion) {
  return trace.getTracer(name, version);
}

export function getCurrentSpanContext() {
  return trace.getActiveSpan()?.spanContext();
}
