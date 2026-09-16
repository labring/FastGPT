import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processors: [] as unknown[],
  construct: vi.fn(),
  shutdown: vi.fn(async () => undefined),
  onStart: vi.fn(),
  onEnd: vi.fn(),
  forceFlush: vi.fn(async () => undefined),
  serviceEnv: {
    LANGFUSE_SECRET_KEY: 'secret-key' as string | undefined,
    LANGFUSE_PUBLIC_KEY: 'public-key' as string | undefined,
    LANGFUSE_BASE_URL: 'https://langfuse.example.com' as string | undefined
  }
}));

vi.mock('@fastgpt-sdk/otel/tracing', () => ({
  addSpanProcessor: (processor: unknown) => {
    if (!mocks.processors.includes(processor)) mocks.processors.push(processor);
  }
}));

vi.mock('@langfuse/otel', () => ({
  LangfuseSpanProcessor: class {
    constructor(config: unknown) {
      mocks.construct(config);
    }

    onStart(...args: unknown[]) {
      mocks.onStart(...args);
    }
    onEnd(...args: unknown[]) {
      mocks.onEnd(...args);
    }
    forceFlush() {
      return mocks.forceFlush();
    }
    shutdown() {
      return mocks.shutdown();
    }
  }
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mocks.serviceEnv
}));

import {
  initLangfuseTracing,
  isLangfuseEnabled,
  refreshLangfuseTracing
} from '@fastgpt/service/common/langfuse';

describe('initLangfuseTracing', () => {
  beforeEach(() => {
    global.systemEnv = {} as typeof global.systemEnv;
  });

  it('deduplicates facade registration and rebuilds the processor after shutdown', async () => {
    expect(isLangfuseEnabled()).toBe(true);
    await initLangfuseTracing();
    await initLangfuseTracing();

    expect(mocks.processors).toHaveLength(1);
    expect(mocks.construct).toHaveBeenCalledTimes(1);

    const facade = mocks.processors[0] as {
      onStart: (...args: unknown[]) => void;
      onEnd: (...args: unknown[]) => void;
      forceFlush: () => Promise<void>;
      shutdown: () => Promise<void>;
    };
    facade.onStart('span', 'context');
    facade.onEnd('span');
    await facade.forceFlush();
    expect(mocks.onStart).toHaveBeenCalledWith('span', 'context');
    expect(mocks.onEnd).toHaveBeenCalledWith('span');
    expect(mocks.forceFlush).toHaveBeenCalledTimes(1);

    const firstConfig = mocks.construct.mock.calls[0]?.[0] as {
      shouldExportSpan: (props: { otelSpan: { attributes: Record<string, unknown> } }) => boolean;
    };
    expect(
      firstConfig.shouldExportSpan({ otelSpan: { attributes: { 'langfuse.trace.name': 'x' } } })
    ).toBe(true);
    expect(
      firstConfig.shouldExportSpan({
        otelSpan: { attributes: { 'fastgpt.workflow.mode': 'chat' } }
      })
    ).toBe(false);

    await facade.shutdown();
    await initLangfuseTracing();

    expect(mocks.shutdown).toHaveBeenCalledTimes(1);
    expect(mocks.construct).toHaveBeenCalledTimes(2);

    global.systemEnv = {
      langfuse: {
        secretKey: 'runtime-secret',
        publicKey: 'runtime-public',
        baseUrl: 'https://runtime.example.com'
      }
    } as typeof global.systemEnv;
    await refreshLangfuseTracing();
    expect(mocks.construct).toHaveBeenCalledTimes(3);

    global.systemEnv.langfuse = { baseUrl: 'https://disabled.example.com' };
    await refreshLangfuseTracing();
    expect(isLangfuseEnabled()).toBe(false);
    expect(mocks.shutdown).toHaveBeenCalledTimes(3);
  });
});
