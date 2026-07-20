import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model/type';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const mockGetTmbPermission = vi.hoisted(() => vi.fn());
const mockGetTmbInfoByTmbId = vi.hoisted(() => vi.fn());
const mockGetModelById = vi.hoisted(() => vi.fn());
const mockAppFindById = vi.hoisted(() => vi.fn());
const mockAuthAppByTmbId = vi.hoisted(() => vi.fn());
const mockDatasetFindById = vi.hoisted(() => vi.fn());
const mockAuthDatasetByTmbId = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  getTmbPermission: mockGetTmbPermission
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mockGetTmbInfoByTmbId
}));

vi.mock('@fastgpt/service/core/ai/model/cache', () => ({
  assertModelUsable: (model: unknown) => model,
  assertModelActive: () => undefined,

  getModelById: mockGetModelById
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { findById: mockAppFindById }
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { findById: mockDatasetFindById }
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: mockAuthAppByTmbId
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetByTmbId: mockAuthDatasetByTmbId
}));

function makeModel(overrides: Partial<LLMModelItemType> & { id: string }): SystemModelItemType {
  return {
    type: ModelTypeEnum.llm,
    provider: 'test-provider',
    model: 'test-model',
    name: 'Test Model',
    maxContext: 16000,
    maxResponse: 8000,
    quoteMaxToken: 12000,
    functionCall: true,
    toolChoice: true,
    isActive: true,
    ...overrides
  };
}

describe('getModelPermission logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No collaborator rows by default → NullRoleVal
    mockGetTmbPermission.mockResolvedValue(undefined);
  });

  it('system model (isSystem=true) should be readable by anyone', async () => {
    const { getModelPermission } = await import('@fastgpt/service/support/permission/model/auth');
    const model = makeModel({ id: 'sys-1', isSystem: true });
    const result = await getModelPermission({
      modelData: model,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false
    });
    // ReadRoleVal allows basic read access
    expect(result.hasReadPer).toBe(true);
    expect(result.isOwner).toBe(false);
  });

  it('root has full permission (isOwner=true)', async () => {
    const { getModelPermission } = await import('@fastgpt/service/support/permission/model/auth');
    const model = makeModel({
      id: 'model-1',
      isSystem: false,
      tmbId: 'other-tmb',
      teamId: 'team-1'
    });
    const result = await getModelPermission({
      modelData: model,
      teamId: 'team-1',
      tmbId: 'tmb-root',
      isRoot: true
    });
    expect(result.isOwner).toBe(true);
  });

  it('creator (tmbId match) has isOwner=true', async () => {
    const { getModelPermission } = await import('@fastgpt/service/support/permission/model/auth');
    const model = makeModel({ id: 'model-1', isSystem: false, tmbId: 'tmb-1', teamId: 'team-1' });
    const result = await getModelPermission({
      modelData: model,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false
    });
    expect(result.isOwner).toBe(true);
  });

  it('team owner gets NO owner rights over other members models', async () => {
    const { getModelPermission } = await import('@fastgpt/service/support/permission/model/auth');
    const model = makeModel({
      id: 'model-1',
      isSystem: false,
      tmbId: 'other-tmb',
      teamId: 'team-1'
    });
    const result = await getModelPermission({
      modelData: model,
      teamId: 'team-1',
      tmbId: 'team-owner-tmb',
      isRoot: false
    });
    // User ruling 2026-08: only the creator owns a private model; a team owner
    // without a collaborator row must not get read access either.
    expect(result.isOwner).toBe(false);
    expect(result.hasReadPer).toBe(false);
  });

  it('non-team model returns role=0 (no permission)', async () => {
    const { getModelPermission } = await import('@fastgpt/service/support/permission/model/auth');
    const model = makeModel({ id: 'model-1', isSystem: false, tmbId: 'tmb-1', teamId: 'team-A' });
    const result = await getModelPermission({
      modelData: model,
      teamId: 'team-B',
      tmbId: 'tmb-2',
      isRoot: false
    });
    expect(result.hasReadPer).toBe(false);
    expect(result.isOwner).toBe(false);
  });
});

describe('authModelsByTmbId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTmbInfoByTmbId.mockResolvedValue({ teamId: 'team-1', permission: {} });
    mockGetTmbPermission.mockResolvedValue(undefined);
  });

  it('returns empty result for empty modelIds', async () => {
    const { authModelsByTmbId } = await import('@fastgpt/service/support/permission/model/auth');
    const result = await authModelsByTmbId({ tmbId: 'tmb-1', modelIds: [] });
    expect(result.models).toEqual([]);
  });

  it('rejects unAuthModel when a model is not accessible', async () => {
    mockGetModelById.mockImplementation((id: string) =>
      makeModel({ id, isSystem: false, tmbId: 'other-tmb', teamId: 'team-1' })
    );
    const { authModelsByTmbId } = await import('@fastgpt/service/support/permission/model/auth');
    await expect(
      authModelsByTmbId({
        tmbId: 'tmb-1',
        modelIds: ['model-private'],
        per: 1
      } as any)
    ).rejects.toBe(ModelErrEnum.unAuthModel);
  });

  it('passes a system model without extra checks', async () => {
    mockGetModelById.mockImplementation((id: string) => makeModel({ id, isSystem: true }));
    const { authModelsByTmbId } = await import('@fastgpt/service/support/permission/model/auth');
    const result = await authModelsByTmbId({ tmbId: 'tmb-1', modelIds: ['model-sys'] });
    expect(result.models[0]?.id).toBe('model-sys');
  });

  it('rejects unExist when a modelId is not in the cache', async () => {
    mockGetModelById.mockReturnValue(undefined);
    const { authModelsByTmbId } = await import('@fastgpt/service/support/permission/model/auth');
    await expect(authModelsByTmbId({ tmbId: 'tmb-1', modelIds: ['missing-model'] })).rejects.toBe(
      ModelErrEnum.unExist
    );
  });

  it('bypasses model permission through resourceContext when the app references it', async () => {
    mockGetModelById.mockImplementation((id: string) =>
      makeModel({ id, isSystem: false, tmbId: 'other-tmb', teamId: 'team-1' })
    );
    // The real checkModelAccessThroughResource loads the app and verifies the
    // user's read access on it; satisfy both with mocks so the bypass returns true.
    mockAppFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        modules: [
          {
            nodeId: 'n1',
            flowNodeType: 'chatNode',
            name: 'Chat',
            inputs: [{ key: 'modelId', value: 'model-in-app', selectedTypeIndex: 0 }],
            outputs: []
          }
        ],
        chatConfig: {},
        tmbId: 'owner-tmb',
        teamId: 'team-1'
      })
    });
    mockAuthAppByTmbId.mockResolvedValue({});
    const { authModelsByTmbId } = await import('@fastgpt/service/support/permission/model/auth');
    const result = await authModelsByTmbId({
      tmbId: 'tmb-1',
      modelIds: ['model-in-app'],
      resourceContext: { appId: 'app-1' }
    });
    expect(mockAppFindById).toHaveBeenCalledWith('app-1', expect.any(String));
    expect(result.models[0]?.permission.hasReadPer).toBe(true);
  });
});
