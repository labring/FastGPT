import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  addSpanProcessor,
  configureTracing,
  disposeTracing,
  getTracer
} from '../../src/tracing/client';

describe('addSpanProcessor', () => {
  afterEach(() => {
    trace.disable();
  });

  it('registers the same processor only once', async () => {
    const onStart = vi.fn((_span: Span, _parentContext: Context) => undefined);
    const onEnd = vi.fn((_span: ReadableSpan) => undefined);
    const processor: SpanProcessor = {
      onStart,
      onEnd,
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined)
    };

    addSpanProcessor(processor);
    addSpanProcessor(processor);
    await configureTracing({ tracing: { enabled: true, sampleRatio: 1 } });
    expect(() => addSpanProcessor(processor)).not.toThrow();

    const span = getTracer('test').startSpan('deduplicated');
    span.end();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    await disposeTracing();
    expect(processor.shutdown).toHaveBeenCalledTimes(1);
  });

  it('shuts down extra processors when tracing is disabled', async () => {
    const processor: SpanProcessor = {
      onStart: vi.fn(),
      onEnd: vi.fn(),
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined)
    };

    addSpanProcessor(processor);
    await configureTracing({ tracing: false });
    await disposeTracing();

    expect(processor.shutdown).toHaveBeenCalledTimes(1);
  });

  it('exports processors registered by another module instance', async () => {
    const tracingGlobal = globalThis as typeof globalThis & {
      otelTracingState?: unknown;
    };
    delete tracingGlobal.otelTracingState;

    vi.resetModules();
    const first = await import('../../src/tracing/client');
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const processor: SpanProcessor = {
      onStart,
      onEnd,
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined)
    };
    first.addSpanProcessor(processor);

    vi.resetModules();
    const second = await import('../../src/tracing/client');
    try {
      await second.configureTracing({ tracing: { enabled: true, sampleRatio: 1 } });
      const span = second.getTracer('cross-instance').startSpan('shared');
      span.end();

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      await second.disposeTracing();
      delete tracingGlobal.otelTracingState;
    }
    expect(processor.shutdown).toHaveBeenCalledTimes(1);
  });
});
