import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ManageRoleVal,
  ReadRoleVal,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { PermissionSyncDeadlineError } from '@fastgpt/service/core/dataset/apiDataset/permission/utils';

const markIndependent = vi.fn();
const findDatasetIdById = vi.fn();
const findDirectChildren = vi.fn();
const syncResourceTreePermissions = vi.fn();
const replaceResources = vi.fn();
const fakeTx = { id: 'tx-1', dialect: 'mongo', datasource: 'main', afterCommit: vi.fn() };
const runInTransaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) => cb(fakeTx));
const bumpCollectionPermissionVersion = vi.fn();

vi.mock('@fastgpt/dal/db/transaction', () => ({ runInTransaction }));
vi.mock('@fastgpt/dal/db/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/dal/db/container')>();
  return {
    ...actual,
    injectRepo: (token: { name: string }) => {
      if (token.name === 'DatasetApiSyncRepository') {
        return { bumpCollectionPermissionVersion };
      }
      if (token.name === 'DatasetCollectionApiSyncRepository') {
        return {
          markIndependent,
          findDatasetIdById,
          findDirectChildren
        };
      }
      throw new Error(`Unexpected repo token in writer.test.ts: ${token.name}`);
    }
  };
});
vi.mock('@fastgpt/service/support/permission/repository/resourcePermissionRepo', () => ({
  resourcePermissionRepo: { replaceResources }
}));
vi.mock('@fastgpt/service/support/permission/resourcePermissionService', () => ({
  syncResourceTreePermissions
}));

const { applyCollectionPermissionStates, isSameCollaboratorSet } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/writer');

const teamId = '64b7f4c2f1a2b3c4d5e6f700';
const datasetId = '64b7f4c2f1a2b3c4d5e6f701';
const folderId = '64b7f4c2f1a2b3c4d5e6f7a1';
const apiDatasetServer = {
  apiServer: { baseUrl: 'https://example.com' },
  permissionSync: true
};
const mockDatasetState = (server: unknown = apiDatasetServer) => ({
  apiDatasetServer: server
});

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
  markIndependent.mockResolvedValue(undefined);
  replaceResources.mockResolvedValue({});
  syncResourceTreePermissions.mockResolvedValue(undefined);
  bumpCollectionPermissionVersion.mockResolvedValue(mockDatasetState());
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
      states: [folderState({ changed: false })],
      expectedApiDatasetServer: apiDatasetServer
    });

    expect(result).toEqual({ updated: 0 });
    expect(runInTransaction).not.toHaveBeenCalled();
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
    const failedInheritingChildId = '64b7f4c2f1a2b3c4d5e6f7a4';

    const result = await applyCollectionPermissionStates({
      teamId,
      datasetId,
      states: [folder, file, unchanged],
      preserveResourceIds: [failedInheritingChildId],
      expectedApiDatasetServer: apiDatasetServer
    });

    expect(result).toEqual({ updated: 2 });
    expect(runInTransaction).toHaveBeenCalledTimes(1);
    expect(replaceResources).toHaveBeenCalledWith({
      teamId,
      resourceType: expect.anything(),
      resources: [
        { resourceId: folder.collectionId, collaborators: folder.collaborators },
        { resourceId: file.collectionId, collaborators: file.collaborators }
      ],
      tx: fakeTx
    });
    expect(markIndependent).toHaveBeenCalledWith({
      teamId,
      datasetId,
      collectionIds: [folder.collectionId, file.collectionId],
      tx: fakeTx
    });
    // 只有目录需要物化后代，且 stopResourceIds 同时覆盖本轮目标节点与失败保留节点
    expect(syncResourceTreePermissions).toHaveBeenCalledTimes(1);
    expect(syncResourceTreePermissions).toHaveBeenCalledWith({
      resource: {
        _id: folder.collectionId,
        type: 'folder',
        teamId,
        datasetId,
        parentId: null,
        inheritPermission: true
      },
      resourceType: expect.anything(),
      findCollectionDatasetId: expect.any(Function),
      findDirectChildren: expect.any(Function),
      oldParentCollaborators: folder.currentCollaborators,
      newParentCollaborators: folder.collaborators,
      stopResourceIds: new Set([
        folder.collectionId,
        file.collectionId,
        unchanged.collectionId,
        failedInheritingChildId
      ]),
      tx: fakeTx
    });

    const syncCallArg = syncResourceTreePermissions.mock.calls[0][0];
    await syncCallArg.findCollectionDatasetId({
      teamId,
      collectionId: folder.collectionId,
      tx: fakeTx
    });
    await syncCallArg.findDirectChildren({
      teamId,
      datasetId,
      parentIds: [folder.collectionId],
      tx: fakeTx
    });
    expect(findDatasetIdById).toHaveBeenCalledWith({
      teamId,
      collectionId: folder.collectionId,
      tx: fakeTx
    });
    expect(findDirectChildren).toHaveBeenCalledWith({
      teamId,
      datasetId,
      parentIds: [folder.collectionId],
      tx: fakeTx
    });
  });

  it('reuses a caller-provided tx instead of opening a new transaction', async () => {
    const outerTx = { id: 'outer-tx', dialect: 'mongo', datasource: 'main', afterCommit: vi.fn() };
    const result = await applyCollectionPermissionStates({
      teamId,
      datasetId,
      states: [folderState()],
      expectedApiDatasetServer: apiDatasetServer,
      tx: outerTx as never
    });

    expect(result).toEqual({ updated: 1 });
    expect(runInTransaction).not.toHaveBeenCalled();
    expect(bumpCollectionPermissionVersion).toHaveBeenCalledWith({
      datasetId,
      teamId,
      tx: outerTx
    });
    expect(replaceResources).toHaveBeenCalledWith(expect.objectContaining({ tx: outerTx }));
    expect(markIndependent).toHaveBeenCalledWith(expect.objectContaining({ tx: outerTx }));
    expect(syncResourceTreePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ tx: outerTx })
    );
  });

  it('skips materialization when a folder ACL is unchanged', async () => {
    const shared = [{ tmbId: 'owner', permission: OwnerRoleVal }];

    await applyCollectionPermissionStates({
      teamId,
      datasetId,
      states: [folderState({ collaborators: shared, currentCollaborators: shared })],
      expectedApiDatasetServer: apiDatasetServer
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
        expectedApiDatasetServer: apiDatasetServer,
        deadlineAt: Date.now() - 1
      })
    ).rejects.toBeInstanceOf(PermissionSyncDeadlineError);

    expect(runInTransaction).not.toHaveBeenCalled();
    expect(replaceResources).not.toHaveBeenCalled();
    expect(markIndependent).not.toHaveBeenCalled();
  });

  it('aborts inside the transaction when the dataset lease is lost', async () => {
    const leaseError = new Error('lease lost');
    // 事务外检查通过，事务内再检查时租约已被抢走
    const assertValid = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockImplementation(() => {
        throw leaseError;
      });

    await expect(
      applyCollectionPermissionStates({
        teamId,
        datasetId,
        states: [folderState()],
        expectedApiDatasetServer: apiDatasetServer,
        lease: { signal: new AbortController().signal, assertValid }
      })
    ).rejects.toMatchObject({ name: 'PermissionSyncCancelledError', cause: leaseError });

    // 事务回调内中止：ACL 与继承态都没有写
    expect(replaceResources).not.toHaveBeenCalled();
    expect(markIndependent).not.toHaveBeenCalled();
    expect(syncResourceTreePermissions).not.toHaveBeenCalled();
  });

  it('discards the round when permission sync was disabled during fetch', async () => {
    bumpCollectionPermissionVersion.mockResolvedValue(
      mockDatasetState({ ...apiDatasetServer, permissionSync: false })
    );

    await expect(
      applyCollectionPermissionStates({
        teamId,
        datasetId,
        states: [folderState()],
        expectedApiDatasetServer: apiDatasetServer
      })
    ).rejects.toMatchObject({ name: 'PermissionSyncStaleRoundError' });

    // 旧轮次一个字节都不能落库：关闭后人工设置的 ACL 不能被整集覆盖
    expect(replaceResources).not.toHaveBeenCalled();
    expect(markIndependent).not.toHaveBeenCalled();
    expect(syncResourceTreePermissions).not.toHaveBeenCalled();
  });

  it('discards the round when the external config changed during fetch', async () => {
    bumpCollectionPermissionVersion.mockResolvedValue(
      mockDatasetState({
        ...apiDatasetServer,
        apiServer: { baseUrl: 'https://changed.example.com' }
      })
    );

    await expect(
      applyCollectionPermissionStates({
        teamId,
        datasetId,
        states: [folderState()],
        expectedApiDatasetServer: apiDatasetServer
      })
    ).rejects.toMatchObject({ name: 'PermissionSyncStaleRoundError' });
    expect(replaceResources).not.toHaveBeenCalled();
  });
});
