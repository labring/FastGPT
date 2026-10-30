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

  it('orders owned, shared and system models by independent ranks without changing defaults', async () => {
    const systemFirst = { ...model, modelId: 'system-first', sortOrder: 0 };
    const teamLast = {
      ...model,
      modelId: 'team-last',
      scope: ModelScopeEnum.team,
      tmbId: 'member',
      sortOrder: 200
    };
    const teamFirst = { ...teamLast, modelId: 'team-first', sortOrder: 100 };
    const systemLast = { ...model, modelId: 'system-last', sortOrder: 1 };
    const sharedFirst = {
      ...teamLast,
      modelId: 'shared-first',
      tmbId: 'other-member',
      sortOrder: 0
    };
    const sharedLast = {
      ...sharedFirst,
      modelId: 'shared-last',
      tmbId: 'third-member',
      sortOrder: 1
    };
    const sourceModels = [systemLast, sharedLast, teamLast, sharedFirst, systemFirst, teamFirst];
    setModelTestSnapshot({
      models: sourceModels,
      configuredDefaultModelIds: { llm: systemLast.modelId }
    });

    const result = await handler({ query: { orderBy: 'custom' } } as any);
    expect(result.data?.models.map((item) => item.modelId)).toEqual([
      'team-first',
      'team-last',
      'shared-first',
      'shared-last',
      'system-first',
      'system-last'
    ]);
    expect(result.data?.defaultModelIds.llm).toBe(systemLast.modelId);
    expect(result.data?.models.every((item) => !('requestAuth' in item))).toBe(true);
    expect(
      getCachedSystemModelHandle()
        ?.getActiveModels()
        .map((item) => item.modelId)
    ).toEqual(sourceModels.map((item) => item.modelId));
    const runtimeResult = await handler({ query: {} } as any);
    expect(runtimeResult.data?.models.map((item) => item.modelId)).toEqual(
      sourceModels.map((item) => item.modelId)
    );
  });

  it('keeps unranked models at the end of each group and filters inactive or unauthorized models', async () => {
    const teamModel = { ...model, scope: ModelScopeEnum.team, tmbId: 'member' };
    setModelTestSnapshot({
      models: [
        { ...model, modelId: 'system-unranked-1' },
        { ...teamModel, modelId: 'team-unranked' },
        { ...model, modelId: 'system-unranked-2' },
        { ...teamModel, modelId: 'team-ranked', sortOrder: 10 },
        { ...model, modelId: 'system-ranked', sortOrder: 0 },
        { ...teamModel, modelId: 'shared-unranked-1', tmbId: 'other-member' },
        { ...teamModel, modelId: 'shared-ranked-1', tmbId: 'other-member', sortOrder: 0 },
        { ...teamModel, modelId: 'shared-unranked-2', tmbId: 'third-member' },
        { ...teamModel, modelId: 'shared-ranked-2', tmbId: 'third-member', sortOrder: 0 },
        { ...teamModel, modelId: 'private', tmbId: 'other-member', sortOrder: 0 },
        {
          ...teamModel,
          modelId: 'shared-inactive',
          tmbId: 'other-member',
          sortOrder: 0,
          isActive: false
        },
        { ...model, modelId: 'inactive', sortOrder: 0, isActive: false }
      ]
    });
    mocks.getAuthorizedModelIds.mockResolvedValue(
      new Set([
        'system-unranked-1',
        'team-unranked',
        'system-unranked-2',
        'team-ranked',
        'system-ranked',
        'shared-unranked-1',
        'shared-ranked-1',
        'shared-unranked-2',
        'shared-ranked-2',
        'shared-inactive',
        'inactive'
      ])
    );

    const result = await handler({ query: { orderBy: 'custom' } } as any);
    expect(result.data?.models.map((item) => item.modelId)).toEqual([
      'team-ranked',
      'team-unranked',
      'shared-ranked-1',
      'shared-ranked-2',
      'shared-unranked-1',
      'shared-unranked-2',
      'system-ranked',
      'system-unranked-1',
      'system-unranked-2'
    ]);
  });

  it('groups ownership using the authenticated viewer and does not reuse another viewer display version', async () => {
    const owned = {
      ...model,
      modelId: 'owned',
      scope: ModelScopeEnum.team,
      tmbId: 'member',
      sortOrder: 100
    };
    const shared = { ...owned, modelId: 'shared', tmbId: 'other-member', sortOrder: 0 };
    setModelTestSnapshot({ models: [model, shared, owned] });
    const initial = await handler({ query: { orderBy: 'custom' } } as any);
    expect(initial.data?.models.map((item) => item.modelId)).toEqual([
      'owned',
      'shared',
      model.modelId
    ]);

    mocks.authUserPer.mockResolvedValueOnce({
      teamId: 'team',
      tmbId: 'other-member',
      isRoot: false,
      tmb: { permission: { hasManagePer: false } }
    });
    const otherViewer = await handler({
      query: { orderBy: 'custom', version: initial.version }
    } as any);
    expect(otherViewer.version).not.toBe(initial.version);
    expect(otherViewer.data?.models.map((item) => item.modelId)).toEqual([
      'shared',
      'owned',
      model.modelId
    ]);

    const outLinkAuthData = { shareId: 'share-id', outLinkUid: 'outlink-user' };
    mocks.authOutLink.mockResolvedValueOnce({
      outLinkConfig: { teamId: 'team', tmbId: 'other-member' }
    });
    const outLink = await handler({
      query: { orderBy: 'custom', outLinkAuthData: JSON.stringify(outLinkAuthData) }
    } as any);
    expect(outLink.data?.models.map((item) => item.modelId)).toEqual([
      'shared',
      'owned',
      model.modelId
    ]);
  });

  it('refreshes the display cache after a rank-only change while keeping the runtime version', async () => {
    const first = { ...model, modelId: 'first', sortOrder: 100 };
    const second = { ...model, modelId: 'second', sortOrder: 200 };
    setModelTestSnapshot({ models: [first, second] });
    const runtime = await handler({ query: {} } as any);
    const initial = await handler({ query: { orderBy: 'custom' } } as any);
    expect(initial.version).not.toBe(runtime.version);
    expect(
      await handler({ query: { orderBy: 'custom', version: initial.version } } as any)
    ).toEqual({ version: initial.version });

    setModelTestSnapshot({ models: [{ ...first, sortOrder: 300 }, second] });
    const updated = await handler({
      query: { orderBy: 'custom', version: initial.version }
    } as any);
    expect(updated.version).not.toBe(initial.version);
    expect(updated.data?.models.map((item) => item.modelId)).toEqual(['second', 'first']);
    expect(await handler({ query: { version: runtime.version } } as any)).toEqual({
      version: runtime.version
    });
  });

  it.each([{ models: [] }, { models: [{ ...model, sortOrder: 0 }] }])(
    'supports an empty or system-only custom catalog ($models.length models)',
    async ({ models }) => {
      setModelTestSnapshot({ models });
      const result = await handler({ query: { orderBy: 'custom' } } as any);
      expect(result.data?.models.map((item) => item.modelId)).toEqual(
        models.map((item) => item.modelId)
      );
    }
  );

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
