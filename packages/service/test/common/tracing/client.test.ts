import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';
import { ServerConfigError, UserConfigError } from '@fastgpt/global/common/error/utils';

const mocks = vi.hoisted(() => {
  const startActiveSpan = vi.fn();
  return {
    createTracingOptionsFromEnv: vi.fn(),
    configureTracing: vi.fn(async () => undefined),
    initLangfuseTracing: vi.fn(async () => undefined),
    startActiveSpan,
    getTracer: vi.fn(() => ({ startActiveSpan })),
    serviceEnv: {
      TRACING_OTEL_SAMPLE_RATIO: undefined
    }
  };
});

vi.mock('@fastgpt-sdk/otel/tracing', () => ({
  configureTracing: mocks.configureTracing,
  createTracingOptionsFromEnv: mocks.createTracingOptionsFromEnv,
  disposeTracing: vi.fn(),
  getCurrentSpanContext: vi.fn(),
  getTracer: mocks.getTracer
}));

vi.mock('../../../common/langfuse', () => ({
  initLangfuseTracing: mocks.initLangfuseTracing
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mocks.serviceEnv
}));

import { configureTracing, withActiveSpan } from '@fastgpt/service/common/tracing/client';

describe('configureTracing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not initialize Langfuse when OTel tracing is disabled', async () => {
    const tracingOptions = { tracing: false } as const;
    mocks.createTracingOptionsFromEnv.mockReturnValue(tracingOptions);

    await configureTracing();

    expect(mocks.initLangfuseTracing).not.toHaveBeenCalled();
    expect(mocks.configureTracing).toHaveBeenCalledWith(tracingOptions);
  });

  it('initializes Langfuse before configuring enabled OTel tracing', async () => {
    const tracingOptions = { tracing: { enabled: true } };
    mocks.createTracingOptionsFromEnv.mockReturnValue(tracingOptions);

    await configureTracing();

    expect(mocks.initLangfuseTracing).toHaveBeenCalledTimes(1);
    expect(mocks.configureTracing).toHaveBeenCalledWith(tracingOptions);
    expect(mocks.initLangfuseTracing.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.configureTracing.mock.invocationCallOrder[0]
    );
  });
});

describe('withActiveSpan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not record span exception or ERROR status for UserConfigError', async () => {
    const span = {
      recordException: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn()
    };
    mocks.startActiveSpan.mockImplementation(
      (_name: string, _opts: unknown, fn: (span: typeof span) => Promise<unknown>) => fn(span)
    );
    const error = new UserConfigError('Invalid user schema');

    await expect(
      withActiveSpan({ name: 'workflow.run', tracerName: 'fastgpt.workflow' }, () => {
        throw error;
      })
    ).rejects.toBe(error);

    expect(span.recordException).not.toHaveBeenCalled();
    expect(span.setStatus).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error('unexpected failure'),
    new ServerConfigError('Invalid outbound proxy URL configuration')
  ])('records exception and ERROR status for %s', async (error) => {
    const span = {
      recordException: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn()
    };
    mocks.startActiveSpan.mockImplementation(
      (_name: string, _opts: unknown, fn: (span: typeof span) => Promise<unknown>) => fn(span)
    );

    await expect(
      withActiveSpan({ name: 'workflow.run', tracerName: 'fastgpt.workflow' }, () => {
        throw error;
      })
    ).rejects.toBe(error);

    expect(span.recordException).toHaveBeenCalledWith(error);
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: error.message
    });
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
