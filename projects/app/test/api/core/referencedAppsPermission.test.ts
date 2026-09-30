import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authUserPer: vi.fn(),
  authDataset: vi.fn(),
  authApp: vi.fn(),
  authSkill: vi.fn(),
  findDatasetAndAllChildren: vi.fn(),
  findAppAndAllChildren: vi.fn(),
  listReadableReferencedApps: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: mocks.authUserPer
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mocks.authDataset
}));
vi.mock('@fastgpt/service/support/permission/app/auth', () => ({ authApp: mocks.authApp }));
vi.mock('@fastgpt/service/support/permission/skill/auth', () => ({ authSkill: mocks.authSkill }));
vi.mock('@fastgpt/service/core/dataset/controller', () => ({
  findDatasetAndAllChildren: mocks.findDatasetAndAllChildren
}));
vi.mock('@fastgpt/service/core/app/controller', () => ({
  findAppAndAllChildren: mocks.findAppAndAllChildren
}));
vi.mock('@/service/core/app/referencedApps', () => ({
  listReadableReferencedApps: mocks.listReadableReferencedApps
}));
vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: () => ({
    query: { appId: 'app-1', datasetId: 'dataset-1', toolId: 'tool-1', skillId: 'skill-1' }
  })
}));

// Import handlers after vi.mock so their dependencies use the test doubles.
const { default: skillHandler } = await import('@/pages/api/core/ai/skill/apps');
const { default: datasetHandler } = await import('@/pages/api/core/dataset/apps');
const { default: toolHandler } = await import('@/pages/api/core/app/appsByToolId');
const { default: appHandler } = await import('@/pages/api/core/app/referencedAppsByAppId');

describe('referenced app visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUserPer.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'requester',
      permission: { isOwner: false }
    });
    mocks.authDataset.mockResolvedValue({ permission: { isOwner: true } });
    mocks.authApp.mockResolvedValue({ permission: { isOwner: true } });
    mocks.authSkill.mockResolvedValue({ permission: { isOwner: true } });
    mocks.findDatasetAndAllChildren.mockResolvedValue([]);
    mocks.findAppAndAllChildren.mockResolvedValue([]);
    mocks.listReadableReferencedApps.mockResolvedValue({ list: [], hiddenCount: 0 });
  });

  it('uses the request team permission, not resource ownership, for dataset referenced apps', async () => {
    await datasetHandler({} as never);

    expect(mocks.listReadableReferencedApps).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        tmbId: 'requester',
        isTeamOwner: false,
        resourceType: 'dataset',
        resourceIds: []
      })
    );
  });

  it('uses the request team permission, not resource ownership, for tool referenced apps', async () => {
    await toolHandler({} as never);

    expect(mocks.listReadableReferencedApps).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        tmbId: 'requester',
        isTeamOwner: false,
        resourceType: 'tool',
        resourceIds: []
      })
    );
  });

  it('filters active agent apps and uses request team permission for app referenced apps', async () => {
    mocks.findAppAndAllChildren.mockResolvedValueOnce([
      { _id: 'agent-active', type: AppTypeEnum.workflow, deleteTime: null },
      { _id: 'agent-deleted', type: AppTypeEnum.workflow, deleteTime: new Date() },
      { _id: 'tool-active', type: AppTypeEnum.tool, deleteTime: null }
    ]);

    await appHandler({} as never);

    expect(mocks.listReadableReferencedApps).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        tmbId: 'requester',
        isTeamOwner: false,
        resourceType: 'agent',
        resourceIds: ['agent-active']
      })
    );
  });

  it.each([
    {
      resource: 'app',
      setNonOwner: () => mocks.authApp.mockResolvedValueOnce({ permission: { isOwner: false } }),
      invoke: () => appHandler({} as never),
      error: AppErrEnum.unAuthApp
    },
    {
      resource: 'dataset',
      setNonOwner: () =>
        mocks.authDataset.mockResolvedValueOnce({ permission: { isOwner: false } }),
      invoke: () => datasetHandler({} as never),
      error: DatasetErrEnum.unAuthDataset
    },
    {
      resource: 'tool',
      setNonOwner: () => mocks.authApp.mockResolvedValueOnce({ permission: { isOwner: false } }),
      invoke: () => toolHandler({} as never),
      error: AppErrEnum.unAuthApp
    },
    {
      resource: 'skill',
      setNonOwner: () => mocks.authSkill.mockResolvedValueOnce({ permission: { isOwner: false } }),
      invoke: () => skillHandler({} as never),
      error: SkillErrEnum.unAuthSkill
    }
  ])('rejects non-owner $resource reference lookup', async ({ setNonOwner, invoke, error }) => {
    setNonOwner();

    await expect(invoke()).rejects.toBe(error);

    expect(mocks.findDatasetAndAllChildren).not.toHaveBeenCalled();
    expect(mocks.findAppAndAllChildren).not.toHaveBeenCalled();
    expect(mocks.listReadableReferencedApps).not.toHaveBeenCalled();
  });
});
