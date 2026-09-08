import { handler } from '@/pages/api/core/ai/model/summary';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  authOutLink: vi.fn(),
  findMember: vi.fn(),
  permission: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@/service/support/permission/auth/outLink', () => ({ authOutLink: mocks.authOutLink }));
vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: { findOne: mocks.findMember }
}));
vi.mock('@fastgpt/service/support/permission/model/controller', () => ({
  getMemberModelCatalogPermission: mocks.permission
}));

describe('POST /api/core/ai/model/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team',
      tmbId: 'member',
      isRoot: false,
      tmb: { role: 'member' }
    });
    mocks.permission.mockResolvedValue({ modelIds: ['active', 'disabled'], version: 'p' });
    const base = {
      ...global.systemDefaultModel.llm!,
      name: 'Model',
      avatar: 'logo.svg',
      type: ModelTypeEnum.llm,
      isActive: true,
      requestAuth: 'secret',
      requestUrl: 'private',
      config: { ...global.systemDefaultModel.llm!.config, defaultConfig: { private: true } }
    };
    global.systemModelMap = new Map([
      ['id:active', { ...base, modelId: 'active' }],
      ['id:disabled', { ...base, modelId: 'disabled', isActive: false }],
      ['id:forbidden', { ...base, modelId: 'forbidden' }],
      ['id:forbidden-disabled', { ...base, modelId: 'forbidden-disabled', isActive: false }]
    ]) as typeof global.systemModelMap;
  });
  it('returns all four states in requested order with only display fields', async () => {
    const result = await handler({
      body: { modelIds: ['active', 'disabled', 'deleted', 'forbidden', 'forbidden-disabled'] }
    } as any);
    expect(result.models).toEqual([
      { modelId: 'active', name: 'Model', avatar: 'logo.svg', status: 'active' },
      { modelId: 'disabled', name: 'Model', avatar: 'logo.svg', status: 'disabled' },
      { modelId: 'deleted', status: 'deleted' },
      { modelId: 'forbidden', name: 'Model', avatar: 'logo.svg', status: 'forbidden' },
      { modelId: 'forbidden-disabled', name: 'Model', avatar: 'logo.svg', status: 'forbidden' }
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|private|requestAuth|config/);
    expect(mocks.permission).toHaveBeenCalledWith({
      teamId: 'team',
      tmbId: 'member',
      isTeamOwner: false,
      includeInactive: true
    });
  });
  it('authenticates before looking up even deleted model IDs', async () => {
    mocks.authUserPer.mockRejectedValue(new Error('unauthorized'));
    await expect(handler({ body: { modelIds: ['deleted'] } } as any)).rejects.toThrow(
      'unauthorized'
    );
    expect(mocks.permission).not.toHaveBeenCalled();
  });
  it('derives outlink identity from its server-side configuration', async () => {
    const outLinkAuthData = { shareId: 'share', outLinkUid: 'visitor' };
    mocks.authOutLink.mockResolvedValue({
      outLinkConfig: { teamId: 'link-team', tmbId: 'link-member' }
    });
    mocks.findMember.mockReturnValue({ lean: vi.fn().mockResolvedValue({ role: 'owner' }) });
    await handler({ body: { modelIds: ['active'], outLinkAuthData } } as any);
    expect(mocks.authUserPer).not.toHaveBeenCalled();
    expect(mocks.authOutLink).toHaveBeenCalledWith(outLinkAuthData);
    expect(mocks.permission).toHaveBeenCalledWith({
      teamId: 'link-team',
      tmbId: 'link-member',
      isTeamOwner: true,
      includeInactive: true
    });
  });
  it.each([[], [''], Array(101).fill('active')])(
    'rejects invalid batches before auth',
    async (modelIds) => {
      await expect(handler({ body: { modelIds } } as any)).rejects.toThrow();
      expect(mocks.authUserPer).not.toHaveBeenCalled();
    }
  );
});
