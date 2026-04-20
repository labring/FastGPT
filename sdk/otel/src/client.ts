import { configureLogger, disposeLogger, getLogger } from './logger';
import type { LoggerConfigureOptions } from './logger';
import { configureMetrics, disposeMetrics, getMeter } from './metrics';
import type { MetricsConfigureOptions } from './metrics';
import { configureTracing, disposeTracing, getCurrentSpanContext, getTracer } from './tracing';
import type { TracingConfigureOptions } from './tracing';
import type { OtelConfigureOptions } from './types';

export async function configureOtel(options: OtelConfigureOptions = {}) {
  await Promise.all([
    configureLogger(options.logger ?? ({} satisfies LoggerConfigureOptions)),
    configureMetrics(options.metrics ?? ({} satisfies MetricsConfigureOptions)),
    configureTracing(options.tracing ?? ({} satisfies TracingConfigureOptions))
  ]);
}

export async function disposeOtel() {
  await Promise.all([disposeLogger(), disposeMetrics(), disposeTracing()]);
}

export { getCurrentSpanContext, getLogger, getMeter, getTracer };
