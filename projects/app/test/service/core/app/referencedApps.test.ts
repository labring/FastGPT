import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const mocks = vi.hoisted(() => ({
  findResourceKeysByCollaboratorsPermission: vi.fn(),
  getGroupsByTmbId: vi.fn(),
  getOrgIdSetWithParentByTmbId: vi.fn(),
  addSourceMember: vi.fn(),
  findTeamAppsByPublishedResource: vi.fn()
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
vi.mock('@fastgpt/service/core/app/resourceLookup', () => ({
  findTeamAppsByPublishedResource: mocks.findTeamAppsByPublishedResource
}));

// Import after mocks so this test exercises the formatter with mocked permission and database adapters.
const { formatReadableReferencedApps, listReadableReferencedApps } =
  await import('@/service/core/app/referencedApps');

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
      hiddenCount: 3
    });
  });
});

describe('listReadableReferencedApps', () => {
  it('queries the requested resource and sorts its published apps newest first', async () => {
    mocks.findTeamAppsByPublishedResource.mockResolvedValue({
      apps: [
        {
          _id: '64a000000000000000000001',
          avatar: '',
          intro: '',
          name: 'Older app',
          tmbId: '64a000000000000000000003',
          type: AppTypeEnum.workflow,
          updateTime: new Date('2025-01-01T00:00:00.000Z')
        },
        {
          _id: '64a000000000000000000002',
          avatar: '',
          intro: '',
          name: 'Newer app',
          tmbId: '64a000000000000000000003',
          type: AppTypeEnum.workflow,
          updateTime: new Date('2025-02-01T00:00:00.000Z')
        }
      ]
    });
    mocks.addSourceMember.mockImplementation(async ({ list }) => list);

    const result = await listReadableReferencedApps({
      teamId: 'team-1',
      tmbId: '64a000000000000000000003',
      isTeamOwner: true,
      resourceType: 'skill',
      resourceIds: 'skill-1'
    });

    expect(mocks.findTeamAppsByPublishedResource).toHaveBeenCalledWith({
      teamId: 'team-1',
      type: 'skill',
      ids: 'skill-1'
    });
    expect(result.list.map(({ name }) => name)).toEqual(['Newer app', 'Older app']);
    expect(result.hiddenCount).toBe(0);
  });
  it('returns the newest 100 readable apps without counting truncated apps as hidden', async () => {
    mocks.getGroupsByTmbId.mockResolvedValue([]);
    mocks.getOrgIdSetWithParentByTmbId.mockResolvedValue(new Set());
    mocks.findResourceKeysByCollaboratorsPermission.mockResolvedValue([]);
    mocks.addSourceMember.mockImplementation(async ({ list }) => list);

    const visibleApps = Array.from({ length: 101 }, (_, index) => ({
      _id: (index + 1).toString(16).padStart(24, '0'),
      avatar: '',
      intro: '',
      name: `Visible app ${index}`,
      tmbId: '64a000000000000000000003',
      type: AppTypeEnum.workflow,
      updateTime: new Date(Date.UTC(2025, 0, index + 1))
    }));
    mocks.findTeamAppsByPublishedResource.mockResolvedValue({
      apps: [
        ...visibleApps,
        {
          _id: '64a0000000000000000000ff',
          avatar: '',
          intro: '',
          name: 'Unreadable app',
          tmbId: '64a000000000000000000004',
          type: AppTypeEnum.workflow,
          updateTime: new Date('2026-01-01T00:00:00.000Z')
        }
      ]
    });

    const result = await listReadableReferencedApps({
      teamId: 'team-1',
      tmbId: '64a000000000000000000003',
      isTeamOwner: false,
      resourceType: 'skill',
      resourceIds: 'skill-1'
    });

    expect(result.list.map(({ name }) => name)).toEqual(
      Array.from({ length: 100 }, (_, index) => `Visible app ${100 - index}`)
    );
    expect(result.hiddenCount).toBe(1);
  });
});
