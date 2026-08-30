import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({ getUserModelCatalog: vi.fn() }));
vi.mock('@/web/common/system/api', () => ({ getUserModelCatalog: mocks.getUserModelCatalog }));

import {
  resetUserModelCatalogAfterLogin,
  useUserModelStore
} from '@/web/core/ai/model/useUserModelStore';

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear()
  } satisfies Storage;
};

const catalogData = {
  models: [
    {
      modelId: 'model-id',
      model: 'provider-model',
      name: 'Model',
      provider: 'provider',
      type: ModelTypeEnum.llm,
      scope: 'system' as const,
      isActive: true,
      isCustom: false,
      config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
    }
  ],
  providers: [
    {
      provider: 'provider',
      value: { en: 'Provider', 'zh-CN': 'Provider', 'zh-Hant': 'Provider' },
      avatar: 'provider.svg'
    }
  ],
  defaultModelIds: { llm: 'model-id' }
};

describe('useUserModelStore catalog cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = createStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', storage);
    useUserModelStore.getState().clearMemory();
  });

  it('persists by teamId+tmbId and restores before validating the cached version', async () => {
    mocks.getUserModelCatalog.mockResolvedValueOnce({ version: 'version-1', data: catalogData });
    await useUserModelStore.getState().loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });

    expect(localStorage.getItem('fastgpt:model-catalog:v1:team-1:member-1')).toBeTruthy();
    expect(useUserModelStore.getState().defaultModels.llm?.modelId).toBe('model-id');

    useUserModelStore.getState().clearMemory();
    mocks.getUserModelCatalog.mockResolvedValueOnce({ version: 'version-1' });
    await useUserModelStore.getState().loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });

    expect(mocks.getUserModelCatalog).toHaveBeenLastCalledWith('version-1');
    expect(useUserModelStore.getState().modelMap['model-id']?.model).toBe('provider-model');
  });

  it('does not validate the same identity more than once during one session', async () => {
    mocks.getUserModelCatalog.mockResolvedValueOnce({ version: 'version-1', data: catalogData });
    await useUserModelStore.getState().loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });
    await useUserModelStore.getState().loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });

    expect(mocks.getUserModelCatalog).toHaveBeenCalledTimes(1);
  });

  it('discards a catalog response after the active member identity changes', async () => {
    let resolveFirstRequest: ((value: unknown) => void) | undefined;
    mocks.getUserModelCatalog
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstRequest = resolve;
        })
      )
      .mockResolvedValueOnce({
        version: 'version-2',
        data: {
          ...catalogData,
          models: [{ ...catalogData.models[0], modelId: 'member-2-model' }],
          defaultModelIds: { llm: 'member-2-model' }
        }
      });

    const firstRequest = useUserModelStore
      .getState()
      .loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });
    await useUserModelStore.getState().loadModelCatalog({ teamId: 'team-1', tmbId: 'member-2' });

    resolveFirstRequest?.({ version: 'version-1', data: catalogData });
    await firstRequest;

    expect(useUserModelStore.getState().identity).toBe('team-1:member-2');
    expect(useUserModelStore.getState().modelMap['member-2-model']).toBeDefined();
    expect(useUserModelStore.getState().modelMap['model-id']).toBeUndefined();
  });

  it('keeps persisted catalogs on memory clear and removes all of them after login', async () => {
    localStorage.setItem('fastgpt:model-catalog:v1:team-1:member-1', '{}');
    localStorage.setItem('fastgpt:model-catalog:v1:team-2:member-2', '{}');
    localStorage.setItem('unrelated', 'keep');

    useUserModelStore.getState().clearMemory();
    expect(localStorage.length).toBe(3);

    resetUserModelCatalogAfterLogin();
    expect(localStorage.getItem('fastgpt:model-catalog:v1:team-1:member-1')).toBeNull();
    expect(localStorage.getItem('fastgpt:model-catalog:v1:team-2:member-2')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
