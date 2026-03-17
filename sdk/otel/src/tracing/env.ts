import { configureTracing } from './client';
import { parseBooleanEnv, parseNumberEnv, parseStringEnv } from '../env-utils';
import type { TracingConfigureOptions } from './types';

export type TracingEnvValue = string | boolean | number | undefined;
export type TracingEnv = Record<string, TracingEnvValue>;

export type TracingConfigureFromEnvOptions = {
  env?: TracingEnv;
  defaultServiceName?: string;
  defaultTracerName?: string;
  defaultTracingEnabled?: boolean;
  defaultTracingUrl?: string;
  defaultSampleRatio?: number;
};

function normalizeSampleRatio(value: number, defaultValue: number) {
  if (!Number.isFinite(value)) return defaultValue;
  return Math.max(0, Math.min(1, value));
}

function getSampleRatioFromStandardEnv(env: TracingEnv, defaultValue: number): number {
  const sampler = parseStringEnv(env.OTEL_TRACES_SAMPLER)?.toLowerCase();
  const samplerArg = normalizeSampleRatio(
    parseNumberEnv(env.OTEL_TRACES_SAMPLER_ARG, defaultValue),
    defaultValue
  );

  if (sampler === 'always_off' || sampler === 'parentbased_always_off') return 0;
  if (sampler === 'always_on' || sampler === 'parentbased_always_on') return 1;
  if (sampler === 'traceidratio' || sampler === 'parentbased_traceidratio') {
    return samplerArg;
  }

  return defaultValue;
}

export function createTracingOptionsFromEnv(
  options: TracingConfigureFromEnvOptions = {}
): TracingConfigureOptions {
  const env = options.env ?? process.env;

  const tracesExporter = parseStringEnv(env.OTEL_TRACES_EXPORTER)?.toLowerCase();
  const enabled = parseBooleanEnv(
    env.TRACING_ENABLE_OTEL,
    tracesExporter === 'otlp' || options.defaultTracingEnabled === true
  );
  const defaultSampleRatio = normalizeSampleRatio(options.defaultSampleRatio ?? 1, 1);

  return {
    defaultTracerName: options.defaultTracerName ?? options.defaultServiceName ?? 'fastgpt',
    tracing: enabled
      ? {
          enabled: true,
          serviceName:
            parseStringEnv(env.TRACING_OTEL_SERVICE_NAME) ??
            parseStringEnv(env.OTEL_SERVICE_NAME) ??
            options.defaultServiceName,
          url:
            parseStringEnv(env.TRACING_OTEL_URL) ??
            parseStringEnv(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) ??
            options.defaultTracingUrl,
          sampleRatio: normalizeSampleRatio(
            parseNumberEnv(env.TRACING_OTEL_SAMPLE_RATIO, NaN),
            getSampleRatioFromStandardEnv(env, defaultSampleRatio)
          )
        }
      : false
  };
}

export async function configureTracingFromEnv(options: TracingConfigureFromEnvOptions = {}) {
  return configureTracing(createTracingOptionsFromEnv(options));
}
