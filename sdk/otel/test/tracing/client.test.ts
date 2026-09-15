import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  addSpanProcessor,
  configureTracing,
  disposeTracing,
  getTracer
} from '../../src/tracing/client';

describe('addSpanProcessor', () => {
  it('registers the same processor only once', async () => {
    const exportedSpans: ReadableSpan[] = [];
    const exportSpy = vi
      .spyOn(OTLPTraceExporter.prototype, 'export')
      .mockImplementation((spans, callback) => {
        exportedSpans.push(...spans);
        callback({ code: 0 });
      });
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
    await configureTracing({
      tracing: { enabled: true, sampleRatio: 1, url: 'http://localhost:4318/v1/traces' }
    });
    expect(() => addSpanProcessor(processor)).not.toThrow();

    const span = getTracer('test').startSpan('deduplicated');
    span.setAttribute('fastgpt.workflow.mode', 'chat');
    span.setAttribute('langfuse.trace.input', 'private input');
    span.setAttribute('langfuse.observation.output', 'private output');
    span.end();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
    await disposeTracing();
    expect(processor.shutdown).toHaveBeenCalledTimes(1);
    expect(exportedSpans).toHaveLength(1);
    expect(exportedSpans[0]?.attributes).toEqual({ 'fastgpt.workflow.mode': 'chat' });
    expect(exportedSpans[0]?.spanContext()).toEqual(span.spanContext());
    expect(onEnd.mock.calls[0]?.[0].attributes).toEqual({
      'fastgpt.workflow.mode': 'chat',
      'langfuse.trace.input': 'private input',
      'langfuse.observation.output': 'private output'
    });
    exportSpy.mockRestore();
  });
});
