import type { LogRecord as OTelLogRecord } from '@opentelemetry/api-logs';
import { describe, expect, it } from 'vitest';
import { createLoggerOptionsFromEnv } from '../../src/logger/env';
import { getOpenTelemetrySink } from '../../src/logger/otel';

function createRecord(overrides: Partial<import('@logtape/logtape').LogRecord> = {}) {
  return {
    category: ['test'],
    level: 'info',
    message: ['Message'],
    rawMessage: 'Message',
    timestamp: 1_700_000_000_000,
    properties: {},
    ...overrides
  } satisfies import('@logtape/logtape').LogRecord;
}

function createMemoryLoggerProvider(records: OTelLogRecord[]) {
  return {
    getLogger: () => ({
      emit: (record: OTelLogRecord) => {
        records.push(record);
      }
    })
  };
}

describe('getOpenTelemetrySink', () => {
  it('places structured properties in the log body without duplicating attributes', () => {
    const emitted: OTelLogRecord[] = [];
    const sink = getOpenTelemetrySink({
      loggerProvider: createMemoryLoggerProvider(emitted)
    });

    sink(
      createRecord({
        message: ['Completions body'],
        rawMessage: 'Completions body',
        properties: {
          completionsBody: {
            messages: [
              {
                role: 'user',
                content: 'hello'
              }
            ],
            model: 'deepseek-v3.2',
            stream: true
          }
        }
      })
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.body).toEqual({
      __log_message: 'Completions body',
      completionsBody: {
        messages: [
          {
            role: 'user',
            content: 'hello'
          }
        ],
        model: 'deepseek-v3.2',
        stream: true
      }
    });
    expect(emitted[0]?.attributes).toEqual({
      category: ['test']
    });
  });

  it('keeps scalar placeholders in the structured body message', () => {
    const emitted: OTelLogRecord[] = [];
    const sink = getOpenTelemetrySink({
      loggerProvider: createMemoryLoggerProvider(emitted)
    });

    sink(
      createRecord({
        message: ['User ', 'Ada', ' used ', 3, ' credits'],
        rawMessage: 'User {user} used {count} credits',
        properties: {
          user: 'Ada',
          count: 3
        }
      })
    );

    expect(emitted[0]?.body).toEqual({
      __log_message: 'User Ada used 3 credits',
      user: 'Ada',
      count: 3
    });
  });

  it('uses a fallback body for purely structured logs', () => {
    const emitted: OTelLogRecord[] = [];
    const sink = getOpenTelemetrySink({
      loggerProvider: createMemoryLoggerProvider(emitted)
    });

    sink(
      createRecord({
        message: ['', { a: 1 }, ''],
        rawMessage: '{*}',
        properties: {
          a: 1
        }
      })
    );

    expect(emitted[0]?.body).toEqual({
      __log_message: 'structured log',
      a: 1
    });
    expect(emitted[0]?.attributes?.a).toBeUndefined();
  });

  it('normalizes JS-specific values in the structured body', () => {
    class CustomValue {
      constructor(readonly id: string) {}
    }

    const emitted: OTelLogRecord[] = [];
    const sink = getOpenTelemetrySink({
      loggerProvider: createMemoryLoggerProvider(emitted)
    });
    const circular: Record<string, unknown> = { name: 'root' };
    circular.self = circular;

    sink(
      createRecord({
        properties: {
          nested: {
            map: new Map([['key', { value: 1 }]]),
            set: new Set(['a', 'b']),
            bigint: 1n,
            custom: new CustomValue('custom-1'),
            circular
          }
        }
      })
    );

    expect((emitted[0]?.body as Record<string, unknown>).nested).toEqual({
      map: {
        key: {
          value: 1
        }
      },
      set: ['a', 'b'],
      bigint: '1',
      custom: {
        __type: 'CustomValue',
        id: 'custom-1'
      },
      circular: {
        name: 'root',
        self: '[Circular]'
      }
    });
  });

  it('normalizes top-level errors in the structured body', () => {
    const emitted: OTelLogRecord[] = [];
    const sink = getOpenTelemetrySink({
      loggerProvider: createMemoryLoggerProvider(emitted)
    });
    const error = new Error('boom');

    sink(
      createRecord({
        properties: {
          error
        }
      })
    );

    const body = emitted[0]?.body as Record<string, Record<string, unknown>>;
    expect(body.error?.name).toBe('Error');
    expect(body.error?.message).toBe('boom');
    expect(body.error?.stack).toEqual(expect.any(String));
  });

  it('keeps a property named message without overwriting the log message', () => {
    const emitted: OTelLogRecord[] = [];
    const sink = getOpenTelemetrySink({
      loggerProvider: createMemoryLoggerProvider(emitted)
    });

    sink(
      createRecord({
        message: ['Request completed'],
        rawMessage: 'Request completed',
        properties: {
          message: 'business message'
        }
      })
    );

    expect(emitted[0]?.body).toEqual({
      __log_message: 'Request completed',
      message: 'business message'
    });
  });

  it('does not duplicate trace context fields in the structured body', () => {
    const emitted: OTelLogRecord[] = [];
    const sink = getOpenTelemetrySink({
      loggerProvider: createMemoryLoggerProvider(emitted)
    });

    sink(
      createRecord({
        message: ['Workflow node run'],
        rawMessage: 'Workflow node run',
        properties: {
          traceId: 'trace-id',
          spanId: 'span-id',
          requestId: 'request-id'
        }
      })
    );

    expect(emitted[0]?.body).toEqual({
      __log_message: 'Workflow node run',
      requestId: 'request-id'
    });
  });
});

describe('createLoggerOptionsFromEnv', () => {
  it('creates OTel logger options without body or attribute modes', () => {
    const options = createLoggerOptionsFromEnv({
      env: {
        LOG_ENABLE_OTEL: 'true'
      },
      defaultServiceName: 'test-service'
    });

    expect(options.otel && 'bodyMode' in options.otel).toBe(false);
    expect(options.otel && 'attributeObjectMode' in options.otel).toBe(false);
  });
});
