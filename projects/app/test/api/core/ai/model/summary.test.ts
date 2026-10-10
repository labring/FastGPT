import { handler } from '@/pages/api/core/ai/model/summary';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { getModelTestMap } from '@test/modelCache';
import { getModelTestDefaults, setModelTestMap } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  getTeamModelHandle: async () =>
    (await import('@fastgpt/service/core/ai/model/catalog/cache')).getCachedSystemModelHandle()!
}));
const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  authOutLink: vi.fn(),
  permission: vi.fn(),
  authApp: vi.fn(),
  getAppDraftResourceBaseline: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@/service/support/permission/auth/outLink', () => ({ authOutLink: mocks.authOutLink }));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  authModels: mocks.permission
}));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({ authApp: mocks.authApp }));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppDraftResourceBaseline: mocks.getAppDraftResourceBaseline
}));

describe('POST /api/core/ai/model/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team',
      tmbId: 'member',
      isRoot: false,
      tmb: { permission: { hasManagePer: false } }
    });
    mocks.permission.mockImplementation(async ({ modelIds }) =>
      modelIds.filter((modelId: string) => modelId.startsWith('forbidden'))
    );
    const base = {
      ...getModelTestDefaults().llm!,
      name: 'Model',
      avatar: 'logo.svg',
      type: ModelTypeEnum.llm,
      isActive: true,
      requestAuth: 'secret',
      requestUrl: 'private',
      config: { ...getModelTestDefaults().llm!.config, defaultConfig: { private: true } }
    };
    setModelTestMap(
      new Map([
        ['id:active', { ...base, modelId: 'active' }],
        ['id:disabled', { ...base, modelId: 'disabled', isActive: false }],
        ['id:forbidden', { ...base, modelId: 'forbidden' }],
        ['id:forbidden-disabled', { ...base, modelId: 'forbidden-disabled', isActive: false }]
      ]) as ReturnType<typeof getModelTestMap>
    );
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
      actor: {
        teamId: 'team',
        tmbId: 'member',
        isRoot: false,
        teamPermission: { hasManagePer: false }
      },
      modelIds: expect.any(Array),
      action: 'use',
      handle: expect.anything()
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
    const req = { body: { modelIds: ['active'], outLinkAuthData } } as any;
    await handler(req);
    expect(mocks.authUserPer).not.toHaveBeenCalled();
    expect(mocks.authOutLink).toHaveBeenCalledWith({ ...outLinkAuthData, req });
    expect(mocks.permission).toHaveBeenCalledWith({
      actor: { source: 'outLink', teamId: 'link-team', tmbId: 'link-member' },
      modelIds: expect.any(Array),
      action: 'use',
      handle: expect.anything()
    });
  });
  it.each([[], [''], Array(101).fill('active')])(
    'rejects invalid batches before auth',
    async (modelIds) => {
      await expect(handler({ body: { modelIds } } as any)).rejects.toThrow();
      expect(mocks.authUserPer).not.toHaveBeenCalled();
    }
  );
  it('treats models in app draft baseline as permitted when appId is provided', async () => {
    const appId = '68ad85a7463006c963799a05';
    mocks.authApp.mockResolvedValue({ app: { _id: appId } });
    mocks.getAppDraftResourceBaseline.mockResolvedValue([
      { type: 'model', id: 'forbidden' },
      { type: 'model', id: 'forbidden-disabled' }
    ]);
    const result = await handler({
      body: {
        appId,
        modelIds: ['active', 'forbidden', 'forbidden-disabled']
      }
    } as any);
    expect(mocks.authApp).toHaveBeenCalledWith({
      req: expect.anything(),
      authToken: true,
      appId,
      per: expect.anything()
    });
    expect(mocks.getAppDraftResourceBaseline).toHaveBeenCalledWith(appId);
    expect(result.models).toEqual([
      { modelId: 'active', name: 'Model', avatar: 'logo.svg', status: 'active' },
      { modelId: 'forbidden', name: 'Model', avatar: 'logo.svg', status: 'active' },
      { modelId: 'forbidden-disabled', name: 'Model', avatar: 'logo.svg', status: 'disabled' }
    ]);
  });
  it('falls back to user permissions if authApp fails', async () => {
    const appId = '68ad85a7463006c963799a05';
    mocks.authApp.mockRejectedValue(new Error('unAuthApp'));
    const result = await handler({
      body: {
        appId,
        modelIds: ['active', 'forbidden']
      }
    } as any);
    expect(result.models).toEqual([
      { modelId: 'active', name: 'Model', avatar: 'logo.svg', status: 'active' },
      { modelId: 'forbidden', name: 'Model', avatar: 'logo.svg', status: 'forbidden' }
    ]);
  });
  it('propagates storage failures while reading the app baseline', async () => {
    const appId = '68ad85a7463006c963799a05';
    const failure = new Error('baseline storage unavailable');
    mocks.authApp.mockResolvedValue({ app: { _id: appId } });
    mocks.getAppDraftResourceBaseline.mockRejectedValue(failure);
    await expect(handler({ body: { appId, modelIds: ['active'] } } as any)).rejects.toBe(failure);
  });
});
