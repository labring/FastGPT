import type { LogRecord } from '@logtape/logtape';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSinks } from '../../src/logger/sinks';

const output = vi.hoisted(() => ({
  console: Object.assign(vi.fn(), { [Symbol.dispose]: vi.fn() }),
  otel: Object.assign(vi.fn(), { [Symbol.asyncDispose]: vi.fn(async () => {}) })
}));

vi.mock('@logtape/logtape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@logtape/logtape')>()),
  getConsoleSink: () => output.console
}));
vi.mock('../../src/logger/otel', () => ({ getOpenTelemetrySink: () => output.otel }));

describe('createSinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { properties: { otel: false }, exported: false },
    { properties: { otel: true }, exported: true },
    { properties: { otel: undefined }, exported: true },
    { properties: { otel: null }, exported: true },
    { properties: { otel: 0 }, exported: true },
    { properties: {}, exported: true },
    { properties: { fastgpt: true }, exported: true }
  ])('only explicit otel=false blocks export: $properties', async ({ properties, exported }) => {
    const { sinks } = await createSinks({ otel: { serviceName: 'test', level: 'info' } });
    const record: LogRecord = {
      category: ['test'],
      level: 'info',
      message: ['Diagnostic'],
      rawMessage: 'Diagnostic',
      timestamp: 0,
      properties
    };

    sinks.console?.(record);
    sinks.otel?.(record);

    expect(output.console).toHaveBeenCalledExactlyOnceWith(record);
    expect(output.otel).toHaveBeenCalledTimes(exported ? 1 : 0);
    if (exported) expect(output.otel).toHaveBeenCalledWith(record);
  });

  it('preserves severity and sensitive-property filters even with otel=true', async () => {
    const { sinks } = await createSinks({
      console: false,
      otel: { serviceName: 'test', level: 'warning' },
      sensitiveProperties: ['secret']
    });
    const record: LogRecord = {
      category: ['test'],
      level: 'info',
      message: ['Diagnostic'],
      rawMessage: 'Diagnostic',
      timestamp: 0,
      properties: { otel: true }
    };

    sinks.otel?.(record);
    sinks.otel?.({ ...record, level: 'error', properties: { otel: true, secret: 'private' } });
    expect(output.otel).not.toHaveBeenCalled();

    const visible = { ...record, level: 'error' as const };
    sinks.otel?.(visible);
    expect(output.otel).toHaveBeenCalledExactlyOnceWith(visible);
  });

  it('forwards Symbol.dispose and Symbol.asyncDispose through filtered sinks', async () => {
    const { sinks } = await createSinks({
      console: { enabled: true, level: 'info' },
      otel: { serviceName: 'test', level: 'info' }
    });

    const consoleSink = sinks.console as unknown as Partial<Disposable> | undefined;
    const otelSink = sinks.otel as unknown as Partial<AsyncDisposable> | undefined;
    expect(typeof consoleSink?.[Symbol.dispose]).toBe('function');
    expect(typeof otelSink?.[Symbol.asyncDispose]).toBe('function');

    consoleSink?.[Symbol.dispose]?.();
    await otelSink?.[Symbol.asyncDispose]?.();

    expect(output.console[Symbol.dispose]).toHaveBeenCalledTimes(1);
    expect(output.otel[Symbol.asyncDispose]).toHaveBeenCalledTimes(1);
  });
});
