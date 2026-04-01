import { getErrText } from '@fastgpt/global/common/error/utils';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  configureTracingFromEnv,
  disposeTracing,
  getCurrentSpanContext,
  getTracer
} from '@fastgpt-sdk/otel/tracing';
import { withContext } from '../logger';
import { env } from '../../env';

type SpanAttributeValue = string | number | boolean;
type SpanStatusLike = {
  code?: number;
  message?: string;
};
type TracerLike = ReturnType<typeof getTracer>;
type SpanLike = ReturnType<TracerLike['startSpan']>;

export type TraceLogContext = {
  traceId: string;
  spanId: string;
};

export type ActiveSpanOptions = {
  name: string;
  tracer?: TracerLike;
  tracerName?: string;
  attributes?: Record<string, unknown>;
};

const DEFAULT_PRODUCTION_TRACING_SAMPLE_RATIO = 0.01;
const DEFAULT_NON_PRODUCTION_TRACING_SAMPLE_RATIO = 1;

function getDefaultTracingSampleRatio() {
  if (typeof env.TRACING_OTEL_SAMPLE_RATIO === 'number') {
    return env.TRACING_OTEL_SAMPLE_RATIO;
  }

  return process.env.NODE_ENV === 'production'
    ? DEFAULT_PRODUCTION_TRACING_SAMPLE_RATIO
    : DEFAULT_NON_PRODUCTION_TRACING_SAMPLE_RATIO;
}

function normalizeAttributes(attributes?: Record<string, unknown>) {
  if (!attributes) return;

  const normalized: Record<string, SpanAttributeValue> = {};

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = value satisfies SpanAttributeValue;
      return;
    }
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export async function configureTracing() {
  await configureTracingFromEnv({
    env,
    defaultServiceName: 'fastgpt-client',
    defaultTracerName: 'fastgpt-client',
    defaultSampleRatio: getDefaultTracingSampleRatio()
  });
}

export function getTraceLogContext(): TraceLogContext | undefined {
  const spanContext = getCurrentSpanContext();
  if (!spanContext) return;

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId
  };
}

export function setSpanError(
  span: SpanLike,
  error: unknown,
  extraStatus?: Partial<SpanStatusLike>
) {
  span.recordException(error instanceof Error ? error : new Error(getErrText(error)));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: extraStatus?.message ?? getErrText(error)
  });
}

export async function withActiveSpan<T>(
  options: ActiveSpanOptions,
  callback: (span: SpanLike) => Promise<T> | T
): Promise<T> {
  const tracer = options.tracer ?? getTracer(options.tracerName);

  return tracer.startActiveSpan(
    options.name,
    {
      attributes: normalizeAttributes(options.attributes)
    },
    async (span: SpanLike) => {
      const spanContext = span.spanContext();

      return withContext(
        {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId
        },
        async () => {
          try {
            return await callback(span);
          } catch (error) {
            setSpanError(span, error);
            throw error;
          } finally {
            span.end();
          }
        }
      );
    }
  );
}

export { disposeTracing, getCurrentSpanContext, getTracer };
