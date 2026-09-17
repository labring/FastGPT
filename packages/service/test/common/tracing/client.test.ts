import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createTracingOptionsFromEnv: vi.fn(),
  configureTracing: vi.fn(async () => undefined),
  initLangfuseTracing: vi.fn(async () => undefined),
  serviceEnv: {
    TRACING_OTEL_SAMPLE_RATIO: undefined
  }
}));

vi.mock('@fastgpt-sdk/otel/tracing', () => ({
  configureTracing: mocks.configureTracing,
  createTracingOptionsFromEnv: mocks.createTracingOptionsFromEnv,
  disposeTracing: vi.fn(),
  getCurrentSpanContext: vi.fn(),
  getTracer: vi.fn()
}));

vi.mock('../../../common/langfuse', () => ({
  initLangfuseTracing: mocks.initLangfuseTracing
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mocks.serviceEnv
}));

import { configureTracing } from '@fastgpt/service/common/tracing/client';

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
