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

    expect(mocks.getUserModelCatalog).toHaveBeenLastCalledWith({
      version: 'version-1',
      outLinkAuthData: undefined
    });
    expect(useUserModelStore.getState().modelMap['model-id']?.model).toBe('provider-model');
  });

  it('validates the current version every time the catalog is used', async () => {
    mocks.getUserModelCatalog
      .mockResolvedValueOnce({ version: 'version-1', data: catalogData })
      .mockResolvedValueOnce({
        version: 'version-2',
        data: {
          ...catalogData,
          models: [{ ...catalogData.models[0], modelId: 'updated-model-id' }],
          defaultModelIds: { llm: 'updated-model-id' }
        }
      });
    await useUserModelStore.getState().loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });
    await useUserModelStore.getState().loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });

    expect(mocks.getUserModelCatalog).toHaveBeenNthCalledWith(1, {
      version: undefined,
      outLinkAuthData: undefined
    });
    expect(mocks.getUserModelCatalog).toHaveBeenNthCalledWith(2, {
      version: 'version-1',
      outLinkAuthData: undefined
    });
    expect(useUserModelStore.getState().modelMap['updated-model-id']).toBeDefined();
  });

  it('loads an outlink catalog without persisting permission data', async () => {
    const outLinkAuthData = { shareId: 'share-id', outLinkUid: 'outlink-user' };
    mocks.getUserModelCatalog.mockResolvedValueOnce({ version: 'version-1', data: catalogData });

    await useUserModelStore.getState().loadModelCatalog({ outLinkAuthData });

    expect(mocks.getUserModelCatalog).toHaveBeenCalledWith({
      version: undefined,
      outLinkAuthData
    });
    expect(useUserModelStore.getState().identity).toBe('outlink:share-id');
    expect(localStorage.getItem('fastgpt:model-catalog:v1:outlink:share-id')).toBeNull();
  });

  it('clears an in-memory outlink catalog when its authorization becomes invalid', async () => {
    const outLinkAuthData = { shareId: 'share-id', outLinkUid: 'outlink-user' };
    mocks.getUserModelCatalog.mockResolvedValueOnce({ version: 'version-1', data: catalogData });
    await useUserModelStore.getState().loadModelCatalog({ outLinkAuthData });
    mocks.getUserModelCatalog.mockRejectedValueOnce(new Error('invalid outlink'));

    await expect(
      useUserModelStore.getState().loadModelCatalog({ outLinkAuthData })
    ).rejects.toThrow('invalid outlink');

    expect(useUserModelStore.getState().identity).toBe('outlink:share-id');
    expect(useUserModelStore.getState().modelList).toEqual([]);
    expect(useUserModelStore.getState().loaded).toBe(false);
  });

  it('deduplicates concurrent catalog validation for the same identity', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    mocks.getUserModelCatalog.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    const firstRequest = useUserModelStore
      .getState()
      .loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });
    const secondRequest = useUserModelStore
      .getState()
      .loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });

    expect(secondRequest).toBe(firstRequest);
    expect(mocks.getUserModelCatalog).toHaveBeenCalledTimes(1);
    expect(useUserModelStore.getState().loading).toBe(true);

    resolveRequest?.({ version: 'version-1', data: catalogData });
    await Promise.all([firstRequest, secondRequest]);
    expect(useUserModelStore.getState().loading).toBe(false);
  });

  it('restarts outlink validation when outLinkUid changes and ignores the old response', async () => {
    let resolveOldCredentialRequest: ((value: unknown) => void) | undefined;
    mocks.getUserModelCatalog
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldCredentialRequest = resolve;
        })
      )
      .mockResolvedValueOnce({
        version: 'version-2',
        data: {
          ...catalogData,
          models: [{ ...catalogData.models[0], modelId: 'new-credential-model' }],
          defaultModelIds: { llm: 'new-credential-model' }
        }
      });

    const oldCredentialRequest = useUserModelStore.getState().loadModelCatalog({
      outLinkAuthData: { shareId: 'share-id', outLinkUid: 'old-user' }
    });
    const newCredentialRequest = useUserModelStore.getState().loadModelCatalog({
      outLinkAuthData: { shareId: 'share-id', outLinkUid: 'new-user' }
    });

    expect(newCredentialRequest).not.toBe(oldCredentialRequest);
    expect(mocks.getUserModelCatalog).toHaveBeenNthCalledWith(2, {
      version: undefined,
      outLinkAuthData: { shareId: 'share-id', outLinkUid: 'new-user' }
    });
    await newCredentialRequest;
    resolveOldCredentialRequest?.({ version: 'version-1', data: catalogData });
    await oldCredentialRequest;

    expect(useUserModelStore.getState().modelMap['new-credential-model']).toBeDefined();
    expect(useUserModelStore.getState().modelMap['model-id']).toBeUndefined();
    expect(useUserModelStore.getState().loading).toBe(false);
  });

  it('does not let an obsolete request overwrite a restarted request for the same identity', async () => {
    let resolveObsoleteRequest: ((value: unknown) => void) | undefined;
    mocks.getUserModelCatalog
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveObsoleteRequest = resolve;
        })
      )
      .mockResolvedValueOnce({
        version: 'version-2',
        data: {
          ...catalogData,
          models: [{ ...catalogData.models[0], modelId: 'latest-model-id' }],
          defaultModelIds: { llm: 'latest-model-id' }
        }
      });

    const obsoleteRequest = useUserModelStore
      .getState()
      .loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });
    useUserModelStore.getState().clearMemory();
    const latestRequest = useUserModelStore
      .getState()
      .loadModelCatalog({ teamId: 'team-1', tmbId: 'member-1' });

    expect(latestRequest).not.toBe(obsoleteRequest);
    await latestRequest;
    resolveObsoleteRequest?.({ version: 'version-1', data: catalogData });
    await obsoleteRequest;

    expect(useUserModelStore.getState().modelMap['latest-model-id']).toBeDefined();
    expect(useUserModelStore.getState().modelMap['model-id']).toBeUndefined();
    expect(useUserModelStore.getState().loading).toBe(false);
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

    const loginGeneration = useUserModelStore.getState().loginGeneration;
    resetUserModelCatalogAfterLogin();
    expect(localStorage.getItem('fastgpt:model-catalog:v1:team-1:member-1')).toBeNull();
    expect(localStorage.getItem('fastgpt:model-catalog:v1:team-2:member-2')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(useUserModelStore.getState().loginGeneration).toBe(loginGeneration + 1);
  });
});
