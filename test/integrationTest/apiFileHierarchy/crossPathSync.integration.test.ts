/**
 * INT-4：创建路径（projects/app 的 createApiDatasetCollection）与同步路径
 * （pro/admin 的 apiDatasetProcessor）在**同一份真实内存 Mongo 数据**上对跑。
 *
 * 与既有单路径套件的区别：两边的 mock 只覆盖「非层级依赖」（server 请求、解析队列、
 * 命中已存在节点的 syncCollection），层级相关的代码全部是真实实现 ——
 * buildApiFileTree、两边的父级解析/创建循环、bulkInsertCollections、
 * bulkUpdateCollectionsParent、createOneCollection、MongoDatasetCollection、以及真实事务。
 *
 * MF-1 的判别力：全量导入（本地存在哨兵行）时，同步路径新建的 server 根级节点必须与
 * 创建路径落在同一条本地 parentId 链上（父级 = 哨兵行），而不是平铺在 dataset 根。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { Types } from '@fastgpt/service/common/mongo';
import { apiDatasetProcessor } from '../../../../pro/admin/src/service/core/dataset/dataset/sync';
import { createApiDatasetCollection } from '@/pages/api/core/dataset/collection/create/apiCollectionV2';

const mockState = vi.hoisted(() => ({
  listFiles: vi.fn(),
  /** 文件批写只替换「建 collection」这一步（解析队列需要 Redis）；folder 批仍走真实 bulkInsertCollections */
  createCollectionAndInsertData: vi.fn(),
  syncCollection: vi.fn(),
  delCollection: vi.fn(),
  crawlWebsite: vi.fn(),
  /** 文件批事务真实跑在内存副本集上，记录回执 session 以便断言事务真的开启 */
  sessions: [] as unknown[]
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: any) => handler
}));

// pro/admin 的 sync 读 '@/env' 的 adminEnv，而根仓测试的 '@/env' 是 projects/app 的 env
// （pro 的 env 模块导入期强校验 PRO_TOKEN，且在根仓语义下不应被加载）。仅补 adminEnv，
// 其余导出保持真实，避免影响 setup 里 projects/app 的 appEnv。
vi.mock('@/env', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  adminEnv: { MAX_CRAWL_PAGE: 2000 }
}));

vi.mock('@/service/common/crawler', () => ({
  crawlWebsite: mockState.crawlWebsite
}));

vi.mock('@fastgpt/service/core/dataset/datasetSync', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatasetSyncWorker: vi.fn((processor: unknown) => processor),
  removeDatasetSyncJobScheduler: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: vi.fn(),
  checkTeamDatasetSyncPermission: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: vi.fn(async () => ({
    listFiles: mockState.listFiles,
    getFileContent: vi.fn(),
    getFileRawId: (apiFileId: string) => apiFileId
  }))
}));

vi.mock('@fastgpt/service/core/dataset/collection/utils', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // 命中已存在节点的内容同步要拉全文/hash，与层级无关，替换掉
  syncCollection: mockState.syncCollection
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createCollectionAndInsertData: mockState.createCollectionAndInsertData,
  delCollection: mockState.delCollection
}));

// 覆盖 test/mocks 里的全局替身，恢复真实事务（内存副本集支持）
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => ({
  ...(await importOriginal<object>())
}));

const teamId = new Types.ObjectId();
const tmbId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const createDataset = () =>
  ({
    _id: datasetId,
    teamId,
    tmbId,
    apiDatasetServer: { apiServer: { basePath: 'ROOT' } },
    permission: {},
    chunkSettings: {}
  }) as any;

type ServerSpec = {
  id: string;
  type: 'file' | 'folder';
  /** server 直接父级；null = server 根 */
  parent: string | null;
  name?: string;
};

const item = (spec: ServerSpec, hasChild: boolean) => ({
  id: spec.id,
  rawId: spec.id,
  name: spec.name ?? `name-${spec.id}`,
  type: spec.type,
  hasChild
});

/** 用 parentId -> children 映射驱动 listFiles：创建路径经 basePath('ROOT') 展开，同步路径用 null 列举根 */
const setServerTree = (serverSpecs: ServerSpec[]) => {
  const tree: Record<string, any[]> = { ROOT: [] };
  for (const spec of serverSpecs) {
    const key = spec.parent ?? 'ROOT';
    (tree[key] ??= []).push(
      item(
        spec,
        serverSpecs.some((child) => child.parent === spec.id)
      )
    );
  }
  mockState.listFiles.mockImplementation(
    async ({ parentId }: any) => tree[parentId ?? 'ROOT'] ?? []
  );
  return tree;
};

const listLocalRows = () =>
  MongoDatasetCollection.find({ teamId, datasetId }).lean() as Promise<any[]>;

/**
 * 逐层比对：每个 server 节点在本地的 parentId 必须等于其 server 直系父级对应的本地行。
 * rootLevelParentId 由 scope 决定：全量导入（哨兵）时是哨兵行，局部导入时是请求体父级。
 */
const expectChainMatchesServer = async (
  serverSpecs: ServerSpec[],
  {
    rootLevelParentId,
    rootLevelApiFileParentId
  }: { rootLevelParentId: string; rootLevelApiFileParentId: string | null }
) => {
  const rows = await listLocalRows();
  const byApiFileId = new Map(rows.map((row) => [row.apiFileId, row]));

  for (const spec of serverSpecs) {
    const row = byApiFileId.get(spec.id);
    expect(row, `本地缺少节点 ${spec.id}`).toBeTruthy();

    const expectedParentId =
      spec.parent === null ? rootLevelParentId : String(byApiFileId.get(spec.parent)!._id);
    expect(String(row!.parentId), `${spec.id} 的本地 parentId`).toBe(expectedParentId);
    expect(row!.apiFileParentId ?? null, `${spec.id} 的 apiFileParentId`).toBe(
      spec.parent ?? rootLevelApiFileParentId
    );
  }
};

describe('API 文件库：创建路径与同步路径在同一份数据上收敛', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.sessions.length = 0;
    mockState.syncCollection.mockResolvedValue(undefined);
    mockState.delCollection.mockResolvedValue(undefined);
    mockState.crawlWebsite.mockResolvedValue(undefined);
    // 真实 createOneCollection 落库；生产实现在这里还会建训练账单并推解析队列（需要 Redis）
    mockState.createCollectionAndInsertData.mockImplementation(
      async ({ createCollectionParams, session }: any) => {
        mockState.sessions.push(session);
        const collection = await createOneCollection({ ...createCollectionParams, session });
        return { collectionId: String(collection._id), results: { insertLen: 0 } };
      }
    );
  });

  it('INT-4-1 全量导入后同步新增根级节点：两路径写出同一棵 parentId 链，二次同步不重复', async () => {
    const serverSpecs: ServerSpec[] = [
      { id: 'a', type: 'folder', parent: null },
      { id: 'f0', type: 'file', parent: null },
      { id: 'a1', type: 'folder', parent: 'a' },
      { id: 'af', type: 'file', parent: 'a' },
      { id: 'a1f', type: 'file', parent: 'a1' }
    ];
    const tree = setServerTree(serverSpecs);

    // 阶段 1：创建路径。用户在导入弹窗「全选」→ 只提交根哨兵
    const created = await createApiDatasetCollection({
      datasetId: String(datasetId),
      apiFiles: [item({ id: RootCollectionId, type: 'folder', parent: null }, true)],
      customPdfParse: false,
      trainingType: 'chunk',
      teamId,
      tmbId,
      dataset: createDataset()
    } as any);
    expect(created).toEqual({ successCount: 6, failedCount: 0 });

    // 阶段 2：server 根出现新节点，走同步路径补齐
    serverSpecs.push(
      { id: 'new-f', type: 'folder', parent: null },
      { id: 'new-file', type: 'file', parent: null }
    );
    tree.ROOT.push(
      item({ id: 'new-f', type: 'folder', parent: null }, false),
      item({ id: 'new-file', type: 'file', parent: null }, false)
    );

    await apiDatasetProcessor(createDataset());

    const rows = await listLocalRows();
    const byApiFileId = new Map(rows.map((row) => [row.apiFileId, row]));
    const sentinel = byApiFileId.get(RootCollectionId);
    expect(sentinel, '创建路径应写出哨兵行').toBeTruthy();
    expect(sentinel!.parentId ?? null).toBeNull();

    // 创建路径建的节点（a/f0/a1/af/a1f）与同步路径建的节点（new-f/new-file）必须在同一条链上
    await expectChainMatchesServer(serverSpecs, {
      rootLevelParentId: String(sentinel!._id),
      rootLevelApiFileParentId: RootCollectionId
    });

    // 文件批事务真的开了 session
    expect(mockState.sessions.length).toBeGreaterThan(0);
    expect(mockState.sessions.every(Boolean)).toBe(true);

    // 阶段 3：再同步一次不得新建、不得校正、不得删除
    const before = await listLocalRows();
    mockState.syncCollection.mockClear();
    await apiDatasetProcessor(createDataset());

    const after = await listLocalRows();
    expect(after.map((row) => row.apiFileId).sort()).toEqual(
      before.map((row) => row.apiFileId).sort()
    );
    expect(after).toHaveLength(before.length);
    expect((mockState.delCollection.mock.calls[0]?.[0] as any).collections).toHaveLength(0);
    // 本用例健康耗时 ~12s（真实内存副本集 + 真实事务），默认 testTimeout: 20000 在饱和宿主上会假红
  }, 180000);

  it('INT-4-2 局部导入：同步只遍历导入根子树，范围外目录不被创建', async () => {
    const kbFolderId = new Types.ObjectId();
    const serverSpecs: ServerSpec[] = [
      { id: 'a', type: 'folder', parent: null },
      { id: 'a1', type: 'folder', parent: 'a' },
      { id: 'a1f', type: 'file', parent: 'a1' },
      { id: 'af', type: 'file', parent: 'a' },
      // 范围外：server 根下另一个目录，创建与同步都不该碰
      { id: 'b', type: 'folder', parent: null },
      { id: 'b1', type: 'file', parent: 'b' }
    ];
    setServerTree(serverSpecs);

    // 创建路径：用户只选中 a，挂到知识库根 folder
    await createApiDatasetCollection({
      datasetId: String(datasetId),
      apiFiles: [item({ id: 'a', type: 'folder', parent: null }, true)],
      parentId: String(kbFolderId),
      customPdfParse: false,
      trainingType: 'chunk',
      teamId,
      tmbId,
      dataset: createDataset()
    } as any);

    await apiDatasetProcessor(createDataset());

    await expectChainMatchesServer(
      serverSpecs.filter((spec) => spec.id !== 'b' && spec.id !== 'b1'),
      {
        rootLevelParentId: String(kbFolderId),
        rootLevelApiFileParentId: null
      }
    );

    const rows = await listLocalRows();
    expect(rows.map((row) => row.apiFileId).sort()).toEqual(['a', 'a1', 'a1f', 'af']);
    expect(rows.map((row) => row.type).sort()).toEqual(
      [
        DatasetCollectionTypeEnum.folder,
        DatasetCollectionTypeEnum.folder,
        DatasetCollectionTypeEnum.apiFile,
        DatasetCollectionTypeEnum.apiFile
      ].sort()
    );
    // 从未列举过范围外的 b
    const listedParents = mockState.listFiles.mock.calls.map((call) => call[0].parentId);
    expect(listedParents).toContain('a');
    expect(listedParents).not.toContain('b');
    // INT-4-1 超时会级联污染本用例（共用 teamId/datasetId，超时用例的后台写入不被取消），故同样放宽
  }, 180000);
});
