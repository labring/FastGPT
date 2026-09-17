import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  addSpanProcessor,
  configureTracing,
  disposeTracing,
  getTracer
} from '../../src/tracing/client';

describe('addSpanProcessor', () => {
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
});
