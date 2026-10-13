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
  findResourceKeysByCollaboratorsPermission: vi.fn(),
  getGroupsByTmbId: vi.fn(),
  getOrgIdSetWithParentByTmbId: vi.fn(),
  addSourceMember: vi.fn(),
  findTeamAppsByPublishedResource: vi.fn(),
  query: {
    resourceType: 'agent' as 'agent' | 'tool' | 'dataset' | 'skill',
    resourceId: 'agent-target'
  }
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
vi.mock('@fastgpt/service/support/permission/resourcePermissionService', () => ({
  findResourceKeysByCollaboratorsPermission: mocks.findResourceKeysByCollaboratorsPermission
}));
vi.mock('@fastgpt/service/support/permission/memberGroup/controllers', () => ({
  getGroupsByTmbId: mocks.getGroupsByTmbId
}));
vi.mock('@fastgpt/service/support/permission/org/controllers', () => ({
  getOrgIdSetWithParentByTmbId: mocks.getOrgIdSetWithParentByTmbId
}));
vi.mock('@fastgpt/service/support/user/utils', () => ({ addSourceMember: mocks.addSourceMember }));
vi.mock('@fastgpt/service/core/app/resourceLookup', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findTeamAppsByPublishedResource: mocks.findTeamAppsByPublishedResource
  };
});
vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: () => ({ query: mocks.query })
}));

// Import the unified handler after vi.mock so its dependencies use the test doubles.
const { default: handler } = await import('@/pages/api/core/app/referencedApps');

const invoke = (resourceType: 'agent' | 'tool' | 'dataset' | 'skill') => {
  mocks.query = { resourceType, resourceId: `${resourceType}-target` };
  return handler({} as never);
};

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
    mocks.findResourceKeysByCollaboratorsPermission.mockResolvedValue([]);
    mocks.getGroupsByTmbId.mockResolvedValue([]);
    mocks.getOrgIdSetWithParentByTmbId.mockResolvedValue(new Set());
    mocks.addSourceMember.mockImplementation(async ({ list }) => list);
    mocks.findTeamAppsByPublishedResource.mockResolvedValue({ apps: [] });
  });

  it.each([
    { resourceType: 'agent' as const, resourceIds: ['active-agent'] },
    { resourceType: 'tool' as const, resourceIds: ['active-tool'] }
  ])('expands active $resourceType folder descendants', async ({ resourceType, resourceIds }) => {
    mocks.findAppAndAllChildren.mockResolvedValueOnce([
      { _id: 'active-agent', type: AppTypeEnum.workflow, deleteTime: null },
      { _id: 'deleted-agent', type: AppTypeEnum.workflow, deleteTime: new Date() },
      { _id: 'active-tool', type: AppTypeEnum.tool, deleteTime: null }
    ]);

    await invoke(resourceType);

    expect(mocks.findAppAndAllChildren).toHaveBeenCalledWith({
      teamId: 'team-1',
      appId: `${resourceType}-target`,
      fields: '_id type deleteTime'
    });
    expect(mocks.findTeamAppsByPublishedResource).toHaveBeenCalledWith({
      teamId: 'team-1',
      type: resourceType,
      ids: resourceIds
    });
  });

  it('expands active dataset folder descendants', async () => {
    mocks.findDatasetAndAllChildren.mockResolvedValueOnce([
      { _id: 'active-dataset', deleteTime: null },
      { _id: 'deleted-dataset', deleteTime: new Date() }
    ]);

    await invoke('dataset');

    expect(mocks.findDatasetAndAllChildren).toHaveBeenCalledWith({
      teamId: 'team-1',
      datasetId: 'dataset-target',
      fields: '_id deleteTime'
    });
    expect(mocks.findTeamAppsByPublishedResource).toHaveBeenCalledWith({
      teamId: 'team-1',
      type: 'dataset',
      ids: ['active-dataset']
    });
  });

  it('looks up a skill as a flat resource', async () => {
    await invoke('skill');

    expect(mocks.findAppAndAllChildren).not.toHaveBeenCalled();
    expect(mocks.findDatasetAndAllChildren).not.toHaveBeenCalled();
    expect(mocks.findTeamAppsByPublishedResource).toHaveBeenCalledWith({
      teamId: 'team-1',
      type: 'skill',
      ids: ['skill-target']
    });
  });
  it('counts unreadable published references as hidden', async () => {
    mocks.findTeamAppsByPublishedResource.mockResolvedValueOnce({
      apps: [
        {
          _id: 'private-app',
          avatar: '',
          intro: 'private',
          name: 'Private app',
          tmbId: 'another-member',
          type: AppTypeEnum.workflow,
          updateTime: new Date()
        }
      ]
    });

    await expect(invoke('skill')).resolves.toEqual({ list: [], hiddenCount: 1 });
  });

  it.each([
    {
      resourceType: 'agent' as const,
      setNonOwner: () => mocks.authApp.mockResolvedValueOnce({ permission: { isOwner: false } }),
      error: AppErrEnum.unAuthApp
    },
    {
      resourceType: 'tool' as const,
      setNonOwner: () => mocks.authApp.mockResolvedValueOnce({ permission: { isOwner: false } }),
      error: AppErrEnum.unAuthApp
    },
    {
      resourceType: 'dataset' as const,
      setNonOwner: () =>
        mocks.authDataset.mockResolvedValueOnce({ permission: { isOwner: false } }),
      error: DatasetErrEnum.unAuthDataset
    },
    {
      resourceType: 'skill' as const,
      setNonOwner: () => mocks.authSkill.mockResolvedValueOnce({ permission: { isOwner: false } }),
      error: SkillErrEnum.unAuthSkill
    }
  ])(
    'rejects non-owner $resourceType reference lookup',
    async ({ resourceType, setNonOwner, error }) => {
      setNonOwner();

      await expect(invoke(resourceType)).rejects.toBe(error);

      expect(mocks.findDatasetAndAllChildren).not.toHaveBeenCalled();
      expect(mocks.findAppAndAllChildren).not.toHaveBeenCalled();
      expect(mocks.findTeamAppsByPublishedResource).not.toHaveBeenCalled();
    }
  );
});
