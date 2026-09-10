import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { GetAdminSystemModelListResponse } from '@fastgpt/global/openapi/admin/core/ai/model/api';

const mocks = vi.hoisted(() => {
  const slots: { dependencies: readonly unknown[]; value: unknown }[] = [];
  const scheduler = { cursor: 0, slots };

  /** 按 Hook 调用顺序和 Object.is 比较依赖，保留同一挂载实例的 memo/callback 结果。 */
  const memo = <T>(factory: () => T, dependencies: readonly unknown[]): T => {
    const index = scheduler.cursor++;
    const previous = slots[index];
    if (
      previous &&
      previous.dependencies.length === dependencies.length &&
      dependencies.every((dependency, index) => Object.is(dependency, previous.dependencies[index]))
    ) {
      return previous.value as T;
    }

    const value = factory();
    slots[index] = { dependencies: [...dependencies], value };
    return value;
  };

  return {
    scheduler,
    memo,
    request: {
      data: undefined as GetAdminSystemModelListResponse | undefined,
      loading: false,
      error: undefined as Error | undefined
    },
    getAdminModelConfig: vi.fn()
  };
});

// 仅隔离 React 调度和远程请求；实际 Hook 与供应商格式化逻辑保持真实执行。
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useMemo: mocks.memo,
  useCallback: <T>(callback: T, dependencies: readonly unknown[]) =>
    mocks.memo(() => callback, dependencies)
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ ...mocks.request })
}));
vi.mock('@/web/core/ai/config', () => ({ getAdminModelConfig: mocks.getAdminModelConfig }));

import { useAdminModelConfig } from '@/web/core/ai/model/useAdminModelConfig';

describe('useAdminModelConfig', () => {
  /** 模拟同一 Hook 实例重新渲染，不重置已保存的 memo 槽位。 */
  const render = () => {
    mocks.scheduler.cursor = 0;
    return useAdminModelConfig();
  };

  const createResponse = (): GetAdminSystemModelListResponse => ({
    models: [
      {
        modelId: '68ad85a7463006c963799a05',
        model: 'whisper-test',
        name: 'Speech recognition',
        provider: 'OpenAI',
        type: ModelTypeEnum.stt,
        scope: ModelScopeEnum.system,
        isActive: true,
        config: {},
        channels: []
      }
    ],
    channels: [],
    providers: [
      {
        provider: 'OpenAI',
        value: { en: 'OpenAI', 'zh-CN': '开放智能', 'zh-Hant': '開放智能' },
        avatar: 'model/openai'
      }
    ],
    defaultModelIds: { stt: '68ad85a7463006c963799a05' },
    aiproxyChannels: [
      {
        channelId: 1,
        name: { en: 'OpenAI', 'zh-CN': '开放智能', 'zh-Hant': '開放智能' },
        avatar: 'model/openai'
      }
    ]
  });

  beforeEach(() => {
    mocks.scheduler.cursor = 0;
    mocks.scheduler.slots.length = 0;
    mocks.request.data = undefined;
    mocks.request.loading = false;
    mocks.request.error = undefined;
  });

  it('preserves empty collection references while absent, loading, failed and retrying', () => {
    const initial = render();
    expect(initial.systemModelList).toEqual([]);
    expect(initial.defaultModelIds).toEqual({});
    expect(initial.aiproxyChannels).toEqual([]);

    for (const status of [
      { loading: true, error: undefined },
      { loading: false, error: new Error('AI Proxy unavailable') },
      { loading: true, error: undefined },
      { loading: false, error: undefined }
    ]) {
      Object.assign(mocks.request, status);
      const rerendered = render();

      expect(rerendered.loading).toBe(status.loading);
      expect(rerendered.error).toBe(status.error);
      expect(rerendered.systemModelList).toBe(initial.systemModelList);
      expect(rerendered.defaultModelIds).toBe(initial.defaultModelIds);
      expect(rerendered.aiproxyChannels).toBe(initial.aiproxyChannels);
      expect(rerendered.getModelProvider).toBe(initial.getModelProvider);
      expect(rerendered.getModelProviders).toBe(initial.getModelProviders);
    }
  });

  it('publishes real collections and provider metadata without churning them during refresh', () => {
    const initial = render();
    const response = createResponse();
    mocks.request.data = response;
    const loaded = render();

    expect(loaded.systemModelList).toBe(response.models);
    expect(loaded.systemModelList).not.toBe(initial.systemModelList);
    expect(loaded.defaultModelIds).toBe(response.defaultModelIds);
    expect(loaded.aiproxyChannels).toBe(response.aiproxyChannels);
    expect(loaded.getModelProvider('OpenAI', 'zh-CN').name).toBe('开放智能');
    expect(loaded.getModelProviders('en').map((provider) => provider.id)).toEqual(['OpenAI']);

    mocks.request.loading = true;
    const refreshing = render();
    expect(refreshing.systemModelList).toBe(loaded.systemModelList);
    expect(refreshing.defaultModelIds).toBe(loaded.defaultModelIds);
    expect(refreshing.aiproxyChannels).toBe(loaded.aiproxyChannels);
    expect(refreshing.getModelProvider).toBe(loaded.getModelProvider);

    mocks.request.data = { ...response, models: [] };
    const refreshed = render();
    expect(refreshed.systemModelList).toBe(mocks.request.data.models);
    expect(refreshed.systemModelList).not.toBe(loaded.systemModelList);
    expect(refreshed.defaultModelIds).toBe(loaded.defaultModelIds);
    expect(refreshed.aiproxyChannels).toBe(loaded.aiproxyChannels);
    expect(refreshed.getModelProvider).toBe(loaded.getModelProvider);
  });
});
