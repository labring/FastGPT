import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { GetSystemModelConfigResponse } from '@fastgpt/global/openapi/core/ai/model/api';

const mocks = vi.hoisted(() => ({
  getModelConfig: vi.fn(),
  clearMemory: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@/web/core/ai/model/api', () => ({
  getModelConfig: mocks.getModelConfig
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: {
    getState: () => ({
      clearMemory: mocks.clearMemory
    })
  }
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeConfig = (modelNames: string[]): GetSystemModelConfigResponse => ({
  models: modelNames.map((model, index) => ({
    modelId: `68ad85a7463006c963799a0${index}`,
    model,
    name: model,
    type: ModelTypeEnum.llm,
    provider: 'openai',
    scope: ModelScopeEnum.system,
    isActive: true,
    config: { maxContext: 8192, maxResponse: 4096, quoteMaxToken: 2048 },
    channels: []
  })),
  channels: [],
  providers: [],
  defaultModelIds: {}
});

let dom: JSDOM;
let createRoot: typeof import('react-dom/client').createRoot;
let useModelConfig: typeof import('@/web/core/ai/model/useModelConfig').useModelConfig;
let host: HTMLDivElement;
let root: Root;

describe('useModelConfig refresh settlement', () => {
  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    for (const key of ['window', 'document', 'Element', 'Node', 'HTMLElement'] as const) {
      vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
    }
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    ({ createRoot } = await import('react-dom/client'));
    ({ useModelConfig } = await import('@/web/core/ai/model/useModelConfig'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const mountHook = async () => {
    let latest!: ReturnType<typeof useModelConfig>;
    const Harness = () => {
      latest = useModelConfig({ channelType: 'system', language: 'en', manual: true });
      return null;
    };
    await act(async () => {
      root.render(React.createElement(Harness));
    });
    return () => latest;
  };

  it('settles all callers when a concurrent refresh supersedes an earlier in-flight request', async () => {
    const first = createDeferred<GetSystemModelConfigResponse>();
    const second = createDeferred<GetSystemModelConfigResponse>();
    mocks.getModelConfig.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const getLatest = await mountHook();

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    await act(async () => {
      p1 = getLatest().refresh();
      p2 = getLatest().refresh();
    });
    expect(mocks.clearMemory).toHaveBeenCalledTimes(2);

    // 即使首路请求先返回并被 ahooks 忽略，两路调用方仍会在最新请求落定后一起 resolve，不会永久挂起。
    await act(async () => {
      first.resolve(makeConfig(['stale']));
      await Promise.resolve();
    });
    await act(async () => {
      second.resolve(makeConfig(['fresh']));
      await Promise.all([p1, p2]);
    });

    expect(getLatest().models.map((item) => item.model)).toEqual(['fresh']);
  });

  it('rejects waiting refresh callers when the latest refresh request fails', async () => {
    const first = createDeferred<GetSystemModelConfigResponse>();
    const second = createDeferred<GetSystemModelConfigResponse>();
    mocks.getModelConfig.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const getLatest = await mountHook();

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    await act(async () => {
      p1 = getLatest().refresh();
      p2 = getLatest().refresh();
    });

    const failure = new Error('catalog fetch failed');
    const results = Promise.allSettled([p1, p2]);
    await act(async () => {
      second.reject(failure);
      await results;
    });

    expect(await results).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure }
    ]);
  });
});
