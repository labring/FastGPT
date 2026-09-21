import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const mocks = vi.hoisted(() => ({
  findResourceKeysByCollaboratorsPermission: vi.fn(),
  getGroupsByTmbId: vi.fn(),
  getOrgIdSetWithParentByTmbId: vi.fn(),
  addSourceMember: vi.fn()
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

const { formatReadableReferencedApps } = await import('@/service/core/app/referencedApps');

describe('formatReadableReferencedApps', () => {
  it('counts an unreadable referenced app as hidden without exposing it', async () => {
    mocks.getGroupsByTmbId.mockResolvedValue([]);
    mocks.getOrgIdSetWithParentByTmbId.mockResolvedValue(new Set());
    mocks.findResourceKeysByCollaboratorsPermission.mockResolvedValue([]);
    mocks.addSourceMember.mockImplementation(async ({ list }) => list);

    const result = await formatReadableReferencedApps({
      teamId: 'team-1',
      tmbId: 'requester',
      isTeamOwner: false,
      apps: [
        {
          _id: 'private-app',
          avatar: '',
          intro: 'private',
          name: 'Private app',
          tmbId: 'another-member',
          type: AppTypeEnum.workflow,
          updateTime: new Date()
        },
        {
          _id: 'another-private-app',
          avatar: '',
          intro: 'private',
          name: 'Another private app',
          tmbId: 'another-member',
          type: AppTypeEnum.workflow,
          updateTime: new Date()
        },
        {
          _id: 'third-private-app',
          avatar: '',
          intro: 'private',
          name: 'Third private app',
          tmbId: 'third-member',
          type: AppTypeEnum.workflow,
          updateTime: new Date()
        }
      ] as never
    });

    expect(result).toEqual({
      list: [],
      hiddenCount: 3,
      hiddenOwnerGroups: [
        { tmbId: 'another-member', count: 2 },
        { tmbId: 'third-member', count: 1 }
      ]
    });
  });
});
