import { hashStr } from '@fastgpt/global/common/string/tools';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getCachedSystemModelHandle } from '@fastgpt/service/core/ai/model/catalog/cache';
import { setModelTestSnapshot } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  getTeamModelHandle: async () =>
    (await import('@fastgpt/service/core/ai/model/catalog/cache')).getCachedSystemModelHandle()!
}));

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  authOutLink: vi.fn(),
  getAuthorizedModelIds: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  getAuthorizedModelIds: mocks.getAuthorizedModelIds
}));
vi.mock('@fastgpt/service/support/permission/publish/authChat', () => ({
  authOutLink: mocks.authOutLink
}));

import { handler } from '@/pages/api/core/ai/model/catalog';

const model = {
  modelId: 'model-1',
  model: 'provider-model',
  name: 'Model',
  provider: 'provider',
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  isActive: true,
  requestAuth: 'secret',
  config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
} satisfies LLMModelDataType;

describe('GET /api/core/ai/model/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team',
      tmbId: 'member',
      isRoot: false,
      tmb: { permission: { hasManagePer: false } }
    });
    // 与真实鉴权保持一致：仅返回快照内的 active 模型。
    mocks.getAuthorizedModelIds.mockImplementation(
      async ({ handle }: { handle: { getActiveModels: () => { modelId: string }[] } }) =>
        new Set(handle.getActiveModels().map((item) => item.modelId))
    );
    mocks.authOutLink.mockResolvedValue({
      outLinkConfig: { teamId: 'outlink-team', tmbId: 'outlink-member' }
    });
    setModelTestSnapshot({
      version: 'catalog-version',
      models: [model],
      configuredDefaultModelIds: { llm: model.modelId }
    });
    global.ModelProviderRawCache = [
      {
        provider: 'provider',
        value: { en: 'Provider', 'zh-CN': 'Provider', 'zh-Hant': 'Provider' },
        avatar: 'avatar'
      }
    ];
  });

  it('returns the full desensitized catalog when the version changed', async () => {
    const result = await handler({ query: {} } as any);

    expect(mocks.authUserPer).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: true,
        authApiKey: true
      })
    );
    expect(result.version).toBe(
      `3:catalog-version:${hashStr(['catalog-version', model.modelId].join('\n'))}`
    );
    expect(result.data?.models[0]).not.toHaveProperty('requestAuth');
    expect(result.data?.defaultModelIds.llm).toBe(model.modelId);
    expect(result.data?.providers[0].provider).toBe('provider');
  });

  it('keeps one snapshot when the catalog is published during permission resolution', async () => {
    mocks.getAuthorizedModelIds.mockImplementationOnce(async () => {
      setModelTestSnapshot({ version: 'new-catalog', models: [], configuredDefaultModelIds: {} });
      global.ModelProviderRawCache = [];
      return new Set([model.modelId]);
    });
    const result = await handler({ query: {} } as any);
    expect(result.version).toBe(
      `3:catalog-version:${hashStr(['catalog-version', model.modelId].join('\n'))}`
    );
    expect(result.data?.models.map((item) => item.modelId)).toEqual([model.modelId]);
    expect(result.data?.defaultModelIds.llm).toBe(model.modelId);
    expect(result.data?.providers[0].provider).toBe('provider');
  });

  it.each(['authentication', 'permission query'])(
    'rejects %s failure even when the client has the current cached version',
    async (stage) => {
      const failure = new Error(`Injected ${stage} failure`);
      if (stage === 'authentication') {
        mocks.authUserPer.mockRejectedValueOnce(failure);
      } else {
        mocks.getAuthorizedModelIds.mockRejectedValueOnce(failure);
      }

      await expect(
        handler({
          query: {
            version: `3:catalog-version:${hashStr(['catalog-version', model.modelId].join('\n'))}`
          }
        } as any)
      ).rejects.toBe(failure);
      expect(getCachedSystemModelHandle()?.getActiveModels()).toHaveLength(1);
      if (stage === 'authentication') {
        expect(mocks.getAuthorizedModelIds).not.toHaveBeenCalled();
      }
    }
  );

  it('returns only the version when the client cache is current', async () => {
    const result = await handler({
      query: {
        version: `3:catalog-version:${hashStr(['catalog-version', model.modelId].join('\n'))}`
      }
    } as any);

    expect(result).toEqual({
      version: `3:catalog-version:${hashStr(['catalog-version', model.modelId].join('\n'))}`
    });
  });

  it('uses the server-side outlink member identity instead of login auth', async () => {
    const outLinkAuthData = { shareId: 'share-id', outLinkUid: 'outlink-user' };
    const req = { query: { outLinkAuthData: JSON.stringify(outLinkAuthData) } } as any;
    await handler(req);

    expect(mocks.authOutLink).toHaveBeenCalledWith({ ...outLinkAuthData, req });
    expect(mocks.authUserPer).not.toHaveBeenCalled();
    expect(mocks.getAuthorizedModelIds).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { source: 'outLink', teamId: 'outlink-team', tmbId: 'outlink-member' }
      })
    );
  });

  it('keeps catalog order while excluding inactive and unauthorized models', async () => {
    const second = { ...model, modelId: 'model-2', model: 'provider-model-2' };
    setModelTestSnapshot({
      models: [
        model,
        { ...model, modelId: 'inactive', isActive: false },
        { ...model, modelId: 'private', scope: ModelScopeEnum.team, tmbId: 'other-member' },
        second
      ]
    });
    mocks.getAuthorizedModelIds.mockResolvedValue(new Set([second.modelId, model.modelId]));

    const result = await handler({ query: {} } as any);
    expect(result.data?.models.map((item) => item.modelId)).toEqual([
      model.modelId,
      second.modelId
    ]);
    expect(result.data?.defaultModelIds.llm).toBe(model.modelId);
  });

  it('forwards the authenticated actor to getAuthorizedModelIds', async () => {
    mocks.authUserPer.mockResolvedValueOnce({
      teamId: 'admin-team',
      tmbId: 'admin-tmb',
      isRoot: true,
      tmb: { permission: { hasManagePer: true } }
    });
    await handler({ query: {} } as any);

    expect(mocks.getAuthorizedModelIds).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          teamId: 'admin-team',
          tmbId: 'admin-tmb',
          isRoot: true,
          teamPermission: { hasManagePer: true }
        }
      })
    );
  });
});
