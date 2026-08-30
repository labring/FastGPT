import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  authOutLink: vi.fn(),
  findTeamMember: vi.fn(),
  getMemberModelCatalogPermission: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/support/permission/model/controller', () => ({
  getMemberModelCatalogPermission: mocks.getMemberModelCatalogPermission
}));
vi.mock('@/service/support/permission/auth/outLink', () => ({
  authOutLink: mocks.authOutLink
}));
vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: { findOne: mocks.findTeamMember }
}));

import handler from '@/pages/api/core/ai/model/catalog';

const model = {
  modelId: 'model-1',
  model: 'provider-model',
  name: 'Model',
  provider: 'provider',
  type: ModelTypeEnum.llm,
  scope: 'system' as const,
  isActive: true,
  isCustom: false,
  requestAuth: 'secret',
  config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
};

describe('GET /api/core/ai/model/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team',
      tmbId: 'member',
      isRoot: false,
      tmb: { role: 'member' }
    });
    mocks.getMemberModelCatalogPermission.mockResolvedValue({
      modelIds: [model.modelId],
      version: 'permission-version'
    });
    mocks.authOutLink.mockResolvedValue({
      outLinkConfig: { teamId: 'outlink-team', tmbId: 'outlink-member' }
    });
    mocks.findTeamMember.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ role: 'member' })
    });
    global.systemModelCatalogVersion = 'catalog-version';
    global.systemModelMap = new Map([
      [`id:${model.modelId}`, model]
    ]) as typeof global.systemModelMap;
    global.systemActiveModelList = [model] as typeof global.systemActiveModelList;
    global.systemConfiguredDefaultModelIds = { llm: model.modelId };
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

    expect(result.version).toBe('1:catalog-version:permission-version');
    expect(result.data?.models[0]).not.toHaveProperty('requestAuth');
    expect(result.data?.defaultModelIds.llm).toBe(model.modelId);
    expect(result.data?.providers[0].provider).toBe('provider');
  });

  it('returns only the version when the client cache is current', async () => {
    const result = await handler({
      query: { version: '1:catalog-version:permission-version' }
    } as any);

    expect(result).toEqual({ version: '1:catalog-version:permission-version' });
  });

  it('uses the server-side outlink member identity instead of login auth', async () => {
    const outLinkAuthData = { shareId: 'share-id', outLinkUid: 'outlink-user' };
    await handler({ query: { outLinkAuthData: JSON.stringify(outLinkAuthData) } } as any);

    expect(mocks.authOutLink).toHaveBeenCalledWith(outLinkAuthData);
    expect(mocks.authUserPer).not.toHaveBeenCalled();
    expect(mocks.findTeamMember).toHaveBeenCalledWith(
      { _id: 'outlink-member', teamId: 'outlink-team' },
      'role'
    );
    expect(mocks.getMemberModelCatalogPermission).toHaveBeenCalledWith({
      teamId: 'outlink-team',
      tmbId: 'outlink-member',
      isTeamOwner: false
    });
  });

  it('keeps plugin catalog order when permission IDs use a different order', async () => {
    const secondModel = {
      ...model,
      modelId: 'model-2',
      model: 'provider-model-2',
      name: 'Model 2'
    };
    global.systemActiveModelList = [model, secondModel] as typeof global.systemActiveModelList;
    mocks.getMemberModelCatalogPermission.mockResolvedValue({
      modelIds: [secondModel.modelId, model.modelId],
      version: 'permission-version'
    });

    const result = await handler({ query: {} } as any);

    expect(result.data?.models.map((item) => item.modelId)).toEqual([
      model.modelId,
      secondModel.modelId
    ]);
  });
});
