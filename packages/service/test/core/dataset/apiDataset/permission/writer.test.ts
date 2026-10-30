import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ManageRoleVal,
  ReadRoleVal,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { PermissionSyncDeadlineError } from '@fastgpt/service/core/dataset/apiDataset/permission/utils';

const updateMany = vi.fn();
const replaceResources = vi.fn();
const syncResourceTreePermissions = vi.fn();
const mongoSessionRun = vi.fn(async (cb: (session: unknown) => Promise<void>) => cb('session'));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    updateMany,
    collection: { name: 'dataset_collections' }
  }
}));
vi.mock('@fastgpt/service/support/permission/repository/resourcePermissionRepo', () => ({
  resourcePermissionRepo: { replaceResources }
}));
vi.mock('@fastgpt/service/support/permission/resourcePermissionService', () => ({
  syncResourceTreePermissions
}));
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({ mongoSessionRun }));

const { applyCollectionPermissionStates, isSameCollaboratorSet } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/writer');

const teamId = '64b7f4c2f1a2b3c4d5e6f700';
const datasetId = '64b7f4c2f1a2b3c4d5e6f701';
const folderId = '64b7f4c2f1a2b3c4d5e6f7a1';

const folderState = (overrides: Record<string, unknown> = {}) => ({
  collectionId: folderId,
  type: 'folder',
  parentId: null,
  collaborators: [{ tmbId: 'owner', permission: OwnerRoleVal }],
  currentCollaborators: [],
  isIndependent: false,
  changed: true,
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({});
  replaceResources.mockResolvedValue({});
  syncResourceTreePermissions.mockResolvedValue(undefined);
});

describe('isSameCollaboratorSet', () => {
  it('ignores order but compares subject and role', () => {
    const a = [{ tmbId: 't1', permission: ReadRoleVal }];
    const b = [
      { tmbId: 't2', permission: ManageRoleVal },
      { tmbId: 't1', permission: ReadRoleVal }
    ];

    expect(isSameCollaboratorSet(a, [{ tmbId: 't1', permission: ReadRoleVal }])).toBe(true);
    expect(isSameCollaboratorSet(b, [...b].reverse())).toBe(true);
    expect(isSameCollaboratorSet(a, [{ tmbId: 't1', permission: ManageRoleVal }])).toBe(false);
    expect(isSameCollaboratorSet(a, [])).toBe(false);
  });

  it('treats duplicated entries as different sets', () => {
    const single = [{ tmbId: 't1', permission: ReadRoleVal }];
    const duplicated = [...single, ...single];
    expect(isSameCollaboratorSet(single, duplicated)).toBe(false);
  });
});

describe('applyCollectionPermissionStates', () => {
  it('writes nothing when all states are unchanged', async () => {
    const result = await applyCollectionPermissionStates({
      teamId,
      datasetId,
      states: [folderState({ changed: false })]
    });

    expect(result).toEqual({ updated: 0 });
    expect(mongoSessionRun).not.toHaveBeenCalled();
    expect(replaceResources).not.toHaveBeenCalled();
  });

  it('replaces ACL rows, marks nodes independent and materializes changed folders in one transaction', async () => {
    const folder = folderState();
    const file = folderState({
      collectionId: '64b7f4c2f1a2b3c4d5e6f7a2',
      type: 'file',
      parentId: folder.collectionId,
      collaborators: [{ tmbId: 'u1', permission: ReadRoleVal }]
    });
    // 未变化的节点不写库，但仍属于本轮目标集，子树物化不能越过它
    const unchanged = folderState({ collectionId: '64b7f4c2f1a2b3c4d5e6f7a3', changed: false });

    const result = await applyCollectionPermissionStates({
      teamId,
      datasetId,
      states: [folder, file, unchanged]
    });

    expect(result).toEqual({ updated: 2 });
    expect(mongoSessionRun).toHaveBeenCalledTimes(1);
    expect(replaceResources).toHaveBeenCalledWith({
      teamId,
      resourceType: expect.anything(),
      resources: [
        { resourceId: folder.collectionId, collaborators: folder.collaborators },
        { resourceId: file.collectionId, collaborators: file.collaborators }
      ],
      session: 'session'
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId,
        datasetId,
        _id: { $in: [folder.collectionId, file.collectionId] }
      }),
      { $set: { inheritPermission: false } },
      { session: 'session' }
    );
    // 只有目录需要物化后代，且 stopResourceIds 覆盖本轮所有目标节点
    expect(syncResourceTreePermissions).toHaveBeenCalledTimes(1);
    expect(syncResourceTreePermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({
          _id: folder.collectionId,
          inheritPermission: true,
          parentId: null
        }),
        resourceModel: expect.anything(),
        oldParentCollaborators: folder.currentCollaborators,
        newParentCollaborators: folder.collaborators,
        stopResourceIds: new Set([folder.collectionId, file.collectionId, unchanged.collectionId]),
        session: 'session'
      })
    );
  });

  it('skips materialization when a folder ACL is unchanged', async () => {
    const shared = [{ tmbId: 'owner', permission: OwnerRoleVal }];

    await applyCollectionPermissionStates({
      teamId,
      datasetId,
      states: [folderState({ collaborators: shared, currentCollaborators: shared })]
    });

    expect(replaceResources).toHaveBeenCalled();
    expect(syncResourceTreePermissions).not.toHaveBeenCalled();
  });

  it('aborts before any write when the deadline has passed', async () => {
    await expect(
      applyCollectionPermissionStates({
        teamId,
        datasetId,
        states: [folderState()],
        deadlineAt: Date.now() - 1
      })
    ).rejects.toBeInstanceOf(PermissionSyncDeadlineError);

    expect(mongoSessionRun).not.toHaveBeenCalled();
    expect(replaceResources).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
