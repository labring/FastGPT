import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { OwnerRoleVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

const datasetFindOne = vi.fn();
const collectionFind = vi.fn();
const getApiDatasetRequest = vi.fn();
const fetchApiFilePermissions = vi.fn();
const findByResourceIds = vi.fn();
const resolveApiDatasetPermissionItems = vi.fn();
const applyCollectionPermissionStates = vi.fn();

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { findOne: datasetFindOne }
}));
vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: { find: collectionFind }
}));
vi.mock('@fastgpt/service/core/dataset/apiDataset/index', () => ({ getApiDatasetRequest }));
vi.mock('@fastgpt/service/core/dataset/apiDataset/permission/adapters', () => ({
  fetchApiFilePermissions
}));
vi.mock('@fastgpt/service/support/permission/repository/resourcePermissionRepo', () => ({
  resourcePermissionRepo: { findByResourceIds }
}));
vi.mock('@fastgpt/service/core/dataset/apiDataset/permission/resolver', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@fastgpt/service/core/dataset/apiDataset/permission/resolver')
    >();
  return { ...actual, resolveApiDatasetPermissionItems };
});
vi.mock('@fastgpt/service/core/dataset/apiDataset/permission/writer', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@fastgpt/service/core/dataset/apiDataset/permission/writer')
    >();
  return { ...actual, applyCollectionPermissionStates };
});

const { syncCollectionPermissions } =
  await import('@fastgpt/service/core/dataset/apiDataset/permission/sync');

const lean = <T>(rows: T[]) => ({ lean: vi.fn().mockResolvedValue(rows) });

type CollectionRow = {
  _id: string;
  apiFileId: string | null;
  type: string;
  parentId: string | null;
  inheritPermission?: boolean;
};

/**
 * 按查询条件供应 collection 行：`_id` 查询取根行，`parentId` 查询取子行，
 * 不带这两个条件的查询（全量同步）取 all。
 */
const mockCollectionFind = ({
  roots = [],
  children = [],
  all = []
}: {
  roots?: CollectionRow[];
  children?: CollectionRow[];
  all?: CollectionRow[];
}) => {
  collectionFind.mockImplementation(
    (filter: { _id?: { $in: string[] }; parentId?: { $in: string[] } }) => {
      if (filter._id) {
        return lean(roots.filter((row) => filter._id!.$in.includes(row._id)));
      }
      if (filter.parentId) {
        return lean(children.filter((row) => filter.parentId!.$in.includes(String(row.parentId))));
      }
      return lean(all);
    }
  );
};

const teamId = '64b7f4c2f1a2b3c4d5e6f700';
const datasetId = '64b7f4c2f1a2b3c4d5e6f701';

const makeDataset = (apiDatasetServer: Record<string, unknown> | undefined) => ({
  teamId,
  tmbId: 'owner-tmb',
  collectionPermissionEnabled: true,
  apiDatasetServer
});

beforeEach(() => {
  vi.clearAllMocks();
  datasetFindOne.mockReturnValue(lean(makeDataset({ apiServer: {}, permissionSync: true })));
  collectionFind.mockReturnValue(lean([]));
  getApiDatasetRequest.mockResolvedValue({});
  fetchApiFilePermissions.mockResolvedValue(new Map());
  findByResourceIds.mockResolvedValue([]);
  resolveApiDatasetPermissionItems.mockResolvedValue(new Map());
  applyCollectionPermissionStates.mockResolvedValue({ updated: 0 });
});

describe('syncCollectionPermissions', () => {
  it('rejects when the dataset does not exist', async () => {
    datasetFindOne.mockReturnValue(lean(null));

    await expect(syncCollectionPermissions({ teamId, datasetId })).rejects.toBe(
      DatasetErrEnum.unExist
    );
  });

  it('returns zeros without fetching when permission sync is off', async () => {
    datasetFindOne.mockReturnValue(lean(makeDataset({ apiServer: {} })));

    const stats = await syncCollectionPermissions({ teamId, datasetId });

    expect(stats).toEqual({ checked: 0, updated: 0, skipped: 0, failed: 0 });
    expect(getApiDatasetRequest).not.toHaveBeenCalled();
    expect(collectionFind).not.toHaveBeenCalled();
  });

  it('skips missing snapshots, applies owner fallback to [] and writes only changed nodes', async () => {
    const collections = [
      { _id: 'c1', apiFileId: 'f1', type: 'file', parentId: null, inheritPermission: true },
      { _id: 'c2', apiFileId: 'f2', type: 'folder', parentId: null, inheritPermission: true },
      { _id: 'c3', apiFileId: 'f3', type: 'file', parentId: 'c2', inheritPermission: false },
      { _id: 'c4', apiFileId: 'f4', type: 'file', parentId: 'c2', inheritPermission: false }
    ];
    mockCollectionFind({ all: collections });

    const targetOfC3: CollaboratorItemType[] = [
      { tmbId: 'tmb-1', permission: ReadRoleVal },
      { tmbId: 'owner-tmb', permission: OwnerRoleVal }
    ];
    fetchApiFilePermissions.mockResolvedValue(
      new Map([
        ['f1', { apiFileId: 'f1', status: 'ok', permissions: undefined }],
        ['f2', { apiFileId: 'f2', status: 'ok', permissions: [] }],
        [
          'f3',
          {
            apiFileId: 'f3',
            status: 'ok',
            permissions: [{ tmbId: 'tmb-1', permission: ReadRoleVal }]
          }
        ],
        ['f4', { apiFileId: 'f4', status: 'ok', permissions: [] }]
      ])
    );
    resolveApiDatasetPermissionItems.mockResolvedValue(
      new Map([
        ['f1', undefined],
        ['f2', []],
        ['f3', [{ tmbId: 'tmb-1', permission: ReadRoleVal }]],
        ['f4', []]
      ])
    );
    findByResourceIds.mockResolvedValue([
      { resourceId: 'c3', tmbId: 'tmb-1', permission: ReadRoleVal },
      // c4 已独立且 ACL 与目标一致（含 owner 兜底），不应重复写
      { resourceId: 'c4', tmbId: 'owner-tmb', permission: OwnerRoleVal }
    ]);
    applyCollectionPermissionStates.mockResolvedValue({ updated: 2 });

    const stats = await syncCollectionPermissions({ teamId, datasetId });

    expect(stats).toEqual({ checked: 4, updated: 2, skipped: 2, failed: 0 });
    // 抓取只做一次，且覆盖所有带 apiFileId 的节点
    expect(fetchApiFilePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ apiFileIds: ['f1', 'f2', 'f3', 'f4'] })
    );
    expect(resolveApiDatasetPermissionItems).toHaveBeenCalledWith({
      teamId,
      itemsByFileId: new Map([
        ['f1', undefined],
        ['f2', []],
        ['f3', [{ tmbId: 'tmb-1', permission: ReadRoleVal }]],
        ['f4', []]
      ])
    });

    const { states } = applyCollectionPermissionStates.mock.calls[0][0];
    expect(states.map((state: { collectionId: string }) => state.collectionId)).toEqual([
      'c2',
      'c3'
    ]);
    // [] → 独立态 + owner 兜底
    expect(states[0]).toMatchObject({
      collectionId: 'c2',
      type: 'folder',
      parentId: null,
      isIndependent: false,
      changed: true,
      collaborators: [{ tmbId: 'owner-tmb', permission: OwnerRoleVal }]
    });
    // 非空且无管理主体 → 追加 owner 兜底
    expect(states[1].collaborators).toEqual(targetOfC3);
    expect(states[1].currentCollaborators).toEqual([{ tmbId: 'tmb-1', permission: ReadRoleVal }]);
  });

  it('returns zeros without fetching when collection permission is not enabled', async () => {
    datasetFindOne.mockReturnValue(
      lean({
        ...makeDataset({ apiServer: {}, permissionSync: true }),
        collectionPermissionEnabled: false
      })
    );

    const stats = await syncCollectionPermissions({ teamId, datasetId });

    // 开启态检查不通过时写进去的 ACL 没有任何读者，只告警跳过，不把 job 判失败
    expect(stats).toEqual({ checked: 0, updated: 0, skipped: 0, failed: 0 });
    expect(getApiDatasetRequest).not.toHaveBeenCalled();
    expect(collectionFind).not.toHaveBeenCalled();
  });

  it('counts failed nodes, skips them and never resolves or writes them', async () => {
    mockCollectionFind({
      all: [{ _id: 'c1', apiFileId: 'f1', type: 'file', parentId: null, inheritPermission: false }]
    });
    fetchApiFilePermissions.mockResolvedValue(
      new Map([['f1', { apiFileId: 'f1', status: 'failed' }]])
    );

    const stats = await syncCollectionPermissions({ teamId, datasetId });

    expect(stats).toEqual({ checked: 1, updated: 0, skipped: 0, failed: 1 });
    expect(resolveApiDatasetPermissionItems).toHaveBeenCalledWith({
      teamId,
      itemsByFileId: new Map()
    });
    expect(applyCollectionPermissionStates.mock.calls[0][0].states).toEqual([]);
  });

  it('skips a node when external permissions are non-empty but resolve to nothing', async () => {
    mockCollectionFind({
      all: [{ _id: 'c1', apiFileId: 'f1', type: 'file', parentId: null, inheritPermission: false }]
    });
    fetchApiFilePermissions.mockResolvedValue(
      new Map([
        ['f1', { apiFileId: 'f1', status: 'ok', permissions: [{ tmbId: 'x', permission: 4 }] }]
      ])
    );
    resolveApiDatasetPermissionItems.mockResolvedValue(new Map([['f1', []]]));

    const stats = await syncCollectionPermissions({ teamId, datasetId });

    // 不能退化成「仅 owner」：那等于按不可解析的输入撤权
    expect(stats).toEqual({ checked: 1, updated: 0, skipped: 1, failed: 0 });
    expect(applyCollectionPermissionStates.mock.calls[0][0].states).toEqual([]);
  });

  it('forwards the deadline to fetching and writing', async () => {
    const deadlineAt = Date.now() + 60_000;
    mockCollectionFind({
      all: [{ _id: 'c1', apiFileId: 'f1', type: 'file', parentId: null, inheritPermission: false }]
    });
    fetchApiFilePermissions.mockResolvedValue(
      new Map([['f1', { apiFileId: 'f1', status: 'ok', permissions: [] }]])
    );
    resolveApiDatasetPermissionItems.mockResolvedValue(new Map([['f1', []]]));

    await syncCollectionPermissions({ teamId, datasetId, deadlineAt });

    expect(fetchApiFilePermissions).toHaveBeenCalledWith(expect.objectContaining({ deadlineAt }));
    expect(applyCollectionPermissionStates).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineAt })
    );
  });

  it('expands targeted roots into the subtree and syncs only nodes with apiFileId', async () => {
    const rootId = '64b7f4c2f1a2b3c4d5e6f7a1';
    const otherRootId = '64b7f4c2f1a2b3c4d5e6f7a2';
    const localFolderId = 'local-folder';
    mockCollectionFind({
      roots: [
        { _id: rootId, apiFileId: 'f1', type: 'folder', parentId: null, inheritPermission: false }
      ],
      children: [
        // 没有 apiFileId 的本地目录也要继续下钻
        { _id: localFolderId, apiFileId: null, type: 'folder', parentId: rootId },
        {
          _id: 'c2',
          apiFileId: 'f2',
          type: 'file',
          parentId: localFolderId,
          inheritPermission: true
        }
      ]
    });
    fetchApiFilePermissions.mockResolvedValue(
      new Map([
        ['f1', { apiFileId: 'f1', status: 'ok', permissions: undefined }],
        ['f2', { apiFileId: 'f2', status: 'ok', permissions: [] }]
      ])
    );
    resolveApiDatasetPermissionItems.mockResolvedValue(new Map([['f2', []]]));
    applyCollectionPermissionStates.mockResolvedValue({ updated: 1 });

    const stats = await syncCollectionPermissions({
      teamId,
      datasetId,
      collectionIds: [rootId, otherRootId]
    });

    // 先按根 _id 查，再按 parentId 逐层展开；不走全量查询
    expect(collectionFind.mock.calls[0][0]).toMatchObject({ _id: { $in: [rootId, otherRootId] } });
    expect(collectionFind.mock.calls[1][0].parentId.$in).toEqual([rootId]);
    expect(collectionFind.mock.calls[2][0].parentId.$in).toEqual([localFolderId]);
    for (const [filter] of collectionFind.mock.calls) {
      expect(filter).toMatchObject({ teamId, datasetId });
      expect(filter).not.toHaveProperty('apiFileId');
    }
    expect(fetchApiFilePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ apiFileIds: ['f1', 'f2'] })
    );
    expect(stats).toEqual({ checked: 2, updated: 1, skipped: 1, failed: 0 });
  });

  it('returns zeros without querying when no targeted root id is valid', async () => {
    const stats = await syncCollectionPermissions({
      teamId,
      datasetId,
      collectionIds: ['not-an-objectid', '']
    });

    expect(stats).toEqual({ checked: 0, updated: 0, skipped: 0, failed: 0 });
    expect(collectionFind).not.toHaveBeenCalled();
    expect(fetchApiFilePermissions).not.toHaveBeenCalled();
  });

  it('deduplicates targeted roots before querying', async () => {
    const rootId = '64b7f4c2f1a2b3c4d5e6f7a1';
    const otherRootId = '64b7f4c2f1a2b3c4d5e6f7a2';

    await syncCollectionPermissions({
      teamId,
      datasetId,
      collectionIds: [rootId, rootId, otherRootId]
    });

    const firstFilter = collectionFind.mock.calls[0][0] as { _id: { $in: string[] } };
    expect(firstFilter._id.$in).toHaveLength(2);
    expect(new Set(firstFilter._id.$in)).toEqual(new Set([rootId, otherRootId]));
  });

  it('stops on a dirty parentId cycle instead of looping forever', async () => {
    const rootId = '64b7f4c2f1a2b3c4d5e6f7a1';
    // 脏数据：节点把自己挂成了自己的孩子，visited 去重后不再追加 frontier
    const rootRow = {
      _id: rootId,
      apiFileId: 'f1',
      type: 'folder',
      parentId: rootId,
      inheritPermission: false
    };
    mockCollectionFind({ roots: [rootRow], children: [rootRow] });

    await syncCollectionPermissions({ teamId, datasetId, collectionIds: [rootId] });

    expect(collectionFind).toHaveBeenCalledTimes(2);
    expect(fetchApiFilePermissions).toHaveBeenCalledWith(
      expect.objectContaining({ apiFileIds: ['f1'] })
    );
  });
});
