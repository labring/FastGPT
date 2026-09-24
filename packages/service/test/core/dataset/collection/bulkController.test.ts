import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import type {
  BulkInsertCollectionDoc,
  BulkMoveCollectionParentItem,
  BulkUpdateCollectionParentItem
} from '@fastgpt/service/core/dataset/collection/controller';

const {
  mockInsertMany,
  mockFind,
  mockBulkWrite,
  mockLogger,
  mockCreateTrainingUsage,
  mockTrainingInsertMany,
  mockCreateOrGetCollectionTags,
  mockPermissionEnabled,
  mockFindByResource,
  mockFindByResourceIds,
  mockReplaceResources
} = vi.hoisted(() => ({
  mockInsertMany: vi.fn(),
  mockFind: vi.fn(),
  mockBulkWrite: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockCreateTrainingUsage: vi.fn(),
  mockTrainingInsertMany: vi.fn(),
  mockCreateOrGetCollectionTags: vi.fn(),
  mockPermissionEnabled: vi.fn(),
  mockFindByResource: vi.fn(),
  mockFindByResourceIds: vi.fn(),
  mockReplaceResources: vi.fn()
}));

// 开关要回查 dataset 文档、ACL 快照要读写 MongoResourcePermission：都是真库读写，且集合权限
// 生命周期本身由 support/permission 下的测试覆盖。此处只钉「批量路径有没有在**同一事务**里
// 初始化 ACL」，故替换掉这两处 IO。
vi.mock('@fastgpt/service/support/permission/collection/datasetSwitch', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatasetCollectionPermissionEnabled: mockPermissionEnabled
}));
vi.mock(
  '@fastgpt/service/support/permission/repository/resourcePermissionRepo',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    resourcePermissionRepo: {
      findByResource: mockFindByResource,
      findByResourceIds: mockFindByResourceIds,
      replaceResources: mockReplaceResources
    }
  })
);

// 标签解析要读写真库，且其正确性由上游标签模块自身测试覆盖；此处只钉「批量路径有没有把
// 解析结果写进 doc」，故直接 mock 掉解析结果
vi.mock('@fastgpt/service/core/dataset/collection/utils', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createOrGetCollectionTags: mockCreateOrGetCollectionTags
}));

// 配额检查要读真库（team_subscriptions），与 T2-10 的断言无关
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkDatasetIndexLimit: vi.fn()
}));

// 部分 mock：保留 DatasetColCollectionName 等导出，其它 schema 仍引用它们
vi.mock('@fastgpt/service/core/dataset/collection/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/collection/schema')>();
  return {
    ...actual,
    MongoDatasetCollection: {
      ...actual.MongoDatasetCollection,
      insertMany: mockInsertMany,
      find: mockFind,
      bulkWrite: mockBulkWrite
    }
  };
});

// T2-10 只关心「落库文档带了什么」，训练账单、标签解析与解析队列入队不是断言对象
vi.mock('@fastgpt/service/support/wallet/usage/controller', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createTrainingUsage: mockCreateTrainingUsage
}));
vi.mock('@fastgpt/service/core/dataset/training/schema', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/training/schema')>();
  return {
    ...actual,
    MongoDatasetTraining: {
      ...actual.MongoDatasetTraining,
      insertMany: mockTrainingInsertMany
    }
  };
});
// 模型目录依赖全局配置，测试环境无；给定句柄不影响 chunkSize/indexSize 的计算分支
vi.mock('@fastgpt/service/core/ai/model', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getModelHandle: async () => ({
    getLLMModelData: () => ({ modelId: 'agent-model', maxToken: 8000, config: {} }),
    getEmbeddingModelData: () => ({
      modelId: 'embedding-model',
      config: { defaultToken: 100, maxToken: 100, weight: 0 }
    }),
    getVlmModelData: () => undefined
  })
}));

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/logger')>();
  return { ...actual, getLogger: () => mockLogger };
});

import {
  API_FILE_FILE_BATCH_SIZE,
  API_FILE_FOLDER_BATCH_SIZE,
  bulkInsertFolderCollections,
  bulkMoveCollectionsParent,
  bulkUpdateCollectionsParent,
  createApiFileCollectionsBatch,
  formatCollectionParamsByDataset
} from '@fastgpt/service/core/dataset/collection/controller';
import { chunkAutoChunkSize } from '@fastgpt/global/core/dataset/training/utils';

const teamId = 'team-1';
const tmbId = 'tmb-1';
const datasetId = 'dataset-1';

/** 造 folder 骨架文档；_id 用真实 ObjectId，模拟调用方预生成、供后续节点引用 */
const makeDocs = (count: number): BulkInsertCollectionDoc[] =>
  Array.from({ length: count }, (_, i) => ({
    _id: new Types.ObjectId(),
    name: `folder-${i}`,
    type: DatasetCollectionTypeEnum.folder,
    apiFileId: `api-${i}`,
    apiFileParentId: null,
    parentId: null
  }));

/** 造层级校正项 */
const makeUpdates = (count: number): BulkUpdateCollectionParentItem[] =>
  Array.from({ length: count }, (_, i) => ({
    _id: `collection-${i}`,
    parentId: new Types.ObjectId(),
    apiFileParentId: `api-parent-${i}`
  }));

/** 造 ACL 迁移与层级校正的组合入参 */
const makeMoveItems = (count: number): BulkMoveCollectionParentItem[] =>
  Array.from({ length: count }, (_, i) => ({
    _id: `collection-${i}`,
    datasetId,
    type: DatasetCollectionTypeEnum.apiFile,
    inheritPermission: true,
    oldParentId: `old-parent-${i}`,
    newParentId: new Types.ObjectId(),
    apiFileParentId: `api-parent-${i}`
  }));

/** mock MongoDatasetCollection.find(...).lean() 返回已落库文档 */
const mockFindLanded = (landed: Array<{ _id: Types.ObjectId }>) => {
  mockFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(landed) });
};

/** T2-10 用的最小 dataset / 文件入参（模型解析走真实实现，故只给必要字段） */
const makeDataset = () => ({ _id: datasetId, teamId, agentModel: 'a', embeddingModel: 'e' }) as any;
const makeFile = (apiFileId: string) => ({
  name: apiFileId,
  apiFileId,
  apiFileParentId: null,
  parentId: null
});

describe('bulkInsertFolderCollections', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 默认关闭态：本组用例断言的是 insertMany 本身，ACL 写入由 T2-12 单独覆盖
    mockPermissionEnabled.mockResolvedValue(false);
  });

  /**
   * 被测函数名: bulkInsertFolderCollections  等级: 3-High
   * 思路（正常场景）: 600 条 docs 按 API_FILE_FOLDER_BATCH_SIZE 分两批 insertMany（500 / 100），
   * 全部 apiFileId 计入成功且成功写入 teamId/tmbId/datasetId
   */
  it('T2-1: 600 条按批大小分两批写入并全部计入成功', async () => {
    const docs = makeDocs(600);
    mockInsertMany.mockResolvedValue([]);

    const result = await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs });

    // 常量约定：folder 批 500，file 事务批 200
    expect(API_FILE_FOLDER_BATCH_SIZE).toBe(500);
    expect(API_FILE_FILE_BATCH_SIZE).toBe(200);
    expect(mockInsertMany).toHaveBeenCalledTimes(2);
    expect(mockInsertMany.mock.calls[0][0]).toHaveLength(500);
    expect(mockInsertMany.mock.calls[1][0]).toHaveLength(100);
    // ordered:false 才会逐条落库，是回查语义的前提；session 是 ACL 与 collection 同事务的载体
    expect(mockInsertMany.mock.calls[0][1]).toMatchObject({ ordered: false });
    expect(mockInsertMany.mock.calls[0][1]).toHaveProperty('session');
    expect(mockInsertMany.mock.calls[0][0][0]).toMatchObject({ teamId, tmbId, datasetId });
    expect(result.successApiFileIds).toHaveLength(600);
    expect(result.failedApiFileIds).toEqual([]);
    expect(mockFind).not.toHaveBeenCalled();
  });

  /**
   * 被测函数名: bulkInsertFolderCollections  等级: 3-High
   * 思路（异常场景）: 第 2 批 insertMany 抛错，回查发现该批仅 docs[500] 落库，
   * 已落库项必须计入成功，其余 99 条计入失败（不能整批标失败产生幽灵缺失）
   */
  it('T2-2: 批失败后按 _id 回查，已落库项计入成功', async () => {
    const docs = makeDocs(600);
    mockInsertMany.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('batch failed'));
    mockFindLanded([{ _id: docs[500]._id }]);

    const result = await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs });

    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFind.mock.calls[0][0]).toMatchObject({
      teamId,
      _id: { $in: docs.slice(500).map((doc) => doc._id) }
    });
    expect(result.successApiFileIds).toHaveLength(501);
    expect(result.successApiFileIds).toContain('api-500');
    expect(result.failedApiFileIds).toHaveLength(99);
    expect(result.failedApiFileIds).not.toContain('api-500');
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  /**
   * 被测函数名: bulkInsertFolderCollections  等级: 3-High
   * 思路（异常场景）: insertMany 抛错且回查为空，该批全部计入失败
   */
  it('T2-3: 整批失败且回查为空时全部计入失败', async () => {
    const docs = makeDocs(10);
    mockInsertMany.mockRejectedValueOnce(new Error('write failed'));
    mockFindLanded([]);

    const result = await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs });

    expect(result.successApiFileIds).toEqual([]);
    expect(result.failedApiFileIds).toEqual(docs.map((doc) => doc.apiFileId));
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  /**
   * 被测函数名: bulkInsertFolderCollections  等级: 3-High
   * 思路（边界场景）: docs 为空时不触发 insertMany，返回空结果
   */
  it('T2-4: 空输入不触发 insertMany', async () => {
    const result = await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs: [] });

    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(result).toEqual({ successApiFileIds: [], failedApiFileIds: [] });
  });

  /**
   * 被测函数名: bulkInsertFolderCollections  等级: 3-High
   * 思路（异常场景）: insertMany 抛错后连回查也失败（如 DB 不可达），无法判定落库情况，
   * 整批计入失败；函数仍 resolve，且原始错误与回查错误都要落日志
   */
  it('T2-9: 回查失败时整批计入失败且不抛异常', async () => {
    const docs = makeDocs(10);
    const insertError = new Error('write failed');
    const recoveryError = new Error('mongo down');
    mockInsertMany.mockRejectedValueOnce(insertError);
    mockFind.mockReturnValue({ lean: vi.fn().mockRejectedValue(recoveryError) });

    await expect(bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs })).resolves.toEqual({
      successApiFileIds: [],
      failedApiFileIds: docs.map((doc) => doc.apiFileId)
    });
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0][1]).toMatchObject({
      teamId,
      datasetId,
      batchSize: 10,
      error: insertError,
      recoveryError
    });
  });

  /**
   * 被测函数名: bulkInsertFolderCollections  等级: 3-High
   * 思路（回归场景）: 批量建骨架曾是一条裸 insertMany —— 启用 collection 权限的 dataset 下，
   * 落库的目录没有任何 ACL 行，除 owner 外全员看不到这些目录（读路径按物化快照解析）。
   * 本用例钉住两件事：必须初始化 ACL，且与 insertMany 用**同一个 session**（同事务）。
   */
  it('T2-12: 启用集合权限时，ACL 与 collection 在同一 session 内写入', async () => {
    const docs = makeDocs(2);
    mockInsertMany.mockResolvedValue([]);
    mockPermissionEnabled.mockResolvedValue(true);
    // 目录挂在 dataset 根（parentId 为 null），父级贡献取 dataset 快照
    mockFindByResource.mockResolvedValue([]);

    await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs });

    expect(mockPermissionEnabled).toHaveBeenCalledWith({
      teamId,
      datasetId,
      // 与 insertMany 同一 session：ACL 行与 collection 必须同事务落库
      session: mockInsertMany.mock.calls[0][1].session
    });
    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
    const call = mockReplaceResources.mock.calls[0][0];
    expect(call.resourceType).toBe(PerResourceTypeEnum.collection);
    expect(call.session).toBe(mockInsertMany.mock.calls[0][1].session);
    expect(call.resources).toEqual(
      docs.map((doc) =>
        expect.objectContaining({
          resourceId: String(doc._id),
          collaborators: [expect.objectContaining({ tmbId, permission: OwnerRoleVal })]
        })
      )
    );
  });

  /**
   * 被测函数名: bulkInsertFolderCollections  等级: 3-High
   * 思路（回归场景）: 批量建目录曾整个丢掉 inheritPermission —— 落库文档退化为 schema default
   * （继承态），ACL 也按 merge(父级快照, owner) 物化。同一轮导入里 file 走 `...body` 已是
   * 独立态，folder 却仍是继承态：请求 inheritPermission=false 的语义是「这部分内容不随
   * 父级扩散」，而目录名与层级恰恰按继承态对父级协作者可见。
   * 本用例钉住两点：独立态目录落库 false，且其快照只含 owner（父级贡献被排除）。
   */
  it('T2-17: inheritPermission=false 的目录落库独立态，ACL 只有 owner', async () => {
    const [inherited, independent] = makeDocs(2);
    const docs: BulkInsertCollectionDoc[] = [
      inherited,
      { ...independent, inheritPermission: false }
    ];
    mockInsertMany.mockResolvedValue([]);
    mockPermissionEnabled.mockResolvedValue(true);
    // 父级快照非空才有判别力：继承态目录必须合并它，独立态目录必须无视它
    mockFindByResource.mockResolvedValue([{ tmbId: 'parent-tmb', permission: OwnerRoleVal }]);

    await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs });

    const [inserted] = mockInsertMany.mock.calls[0];
    expect(inserted[1]).toMatchObject({ inheritPermission: false });
    // 未指定时保持 schema default（继承），不能顺手改成独立态
    expect(inserted[0].inheritPermission).not.toBe(false);

    const call = mockReplaceResources.mock.calls[0][0];
    const collaboratorsOf = (id: Types.ObjectId) =>
      call.resources.find((item: { resourceId: string }) => item.resourceId === String(id))
        .collaborators;
    // 独立态：父级贡献不参与，只有 owner
    expect(collaboratorsOf(independent._id)).toEqual([
      expect.objectContaining({ tmbId, permission: OwnerRoleVal })
    ]);
    // 继承态：合并父级快照
    expect(collaboratorsOf(inherited._id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tmbId: 'parent-tmb' }),
        expect.objectContaining({ tmbId })
      ])
    );
    expect(collaboratorsOf(inherited._id)).toHaveLength(2);
  });
});

describe('bulkUpdateCollectionsParent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（正常场景）: 2 条 updates 一次 bulkWrite 写入，filter 带 teamId 兜底，全部计入 successIds
   */
  it('T2-5: 一次 bulkWrite 完成 2 条层级校正', async () => {
    const updates = makeUpdates(2);
    mockBulkWrite.mockResolvedValue({ writeErrors: [], matchedCount: 2 });

    const result = await bulkUpdateCollectionsParent({ teamId, updates });

    expect(mockBulkWrite).toHaveBeenCalledTimes(1);
    expect(mockBulkWrite.mock.calls[0][0]).toHaveLength(2);
    expect(mockBulkWrite.mock.calls[0][1]).toEqual({ ordered: false });
    // 越权兜底：filter 必须带 teamId
    expect(mockBulkWrite.mock.calls[0][0][0].updateOne.filter).toEqual({
      _id: updates[0]._id,
      teamId
    });
    expect(mockBulkWrite.mock.calls[0][0][0].updateOne.update).toEqual({
      // parentId 传 hex 串，交由 mongoose 转 ObjectId
      $set: { parentId: String(updates[0].parentId), apiFileParentId: updates[0].apiFileParentId }
    });
    expect(result.successIds).toEqual(updates.map((item) => item._id));
    expect(result.failedIds).toEqual([]);
    expect(result.matchedCount).toBe(2);
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（边界场景）: 目标行在调用前被删/重建 —— filter 命中 0 条，驱动不报错、writeErrors 为空，
   * 逐 op 只在 results 里体现「未执行」的 cast 失败，因此这种静默空操作必须靠 matchedCount 暴露。
   * 调用方（同步流程）据此告警；successIds 仍按 op 执行结果计数。
   */
  it('T2-5b: 目标行已不存在时 matchedCount 小于 updates 数', async () => {
    const updates = makeUpdates(3);
    // 3 条 op 只有 1 条命中（另外 2 条的 _id 已被删除/重建）
    mockBulkWrite.mockResolvedValue({ writeErrors: [], matchedCount: 1 });

    const result = await bulkUpdateCollectionsParent({ teamId, updates });

    expect(result.matchedCount).toBe(1);
    expect(result.successIds).toEqual(updates.map((item) => item._id));
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（异常场景）: 真实 mongod。第 2 条 filter 的 _id 不是合法 ObjectId，mongoose 无法 cast，
   * 该 op 从未执行；此时 bulkWrite 会 resolve（不走 catch），必须从 result.mongoose.results 判定失败，
   * 否则会把从未执行的 op 报成 successIds（静默假成功）。
   */
  it('T2-6: 单条 _id cast 失败时未执行的 op 计入 failedIds 而非 successIds', async () => {
    const { MongoDatasetCollection: RealMongoDatasetCollection } = await vi.importActual<
      typeof import('@fastgpt/service/core/dataset/collection/schema')
    >('@fastgpt/service/core/dataset/collection/schema');
    const realTeamId = String(new Types.ObjectId());
    const created = await RealMongoDatasetCollection.create({
      teamId: realTeamId,
      tmbId: String(new Types.ObjectId()),
      datasetId: String(new Types.ObjectId()),
      type: DatasetCollectionTypeEnum.folder,
      name: 'folder-cast-failure',
      parentId: null
    });
    const updates: BulkUpdateCollectionParentItem[] = [
      {
        _id: String(created._id),
        parentId: new Types.ObjectId(),
        apiFileParentId: 'api-parent-0'
      },
      { _id: 'collection-1', parentId: new Types.ObjectId(), apiFileParentId: 'api-parent-1' }
    ];
    // 委托真实模型，走真实驱动语义（cast 失败会 resolve，而不是 reject）
    mockBulkWrite.mockImplementation((ops, options) =>
      RealMongoDatasetCollection.bulkWrite(ops, options)
    );

    const result = await bulkUpdateCollectionsParent({ teamId: realTeamId, updates });

    expect(result.successIds).toEqual([String(created._id)]);
    expect(result.failedIds).toEqual(['collection-1']);
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（异常场景）: 服务端写错误（如物理不可达）使 bulkWrite 整体 reject —— 真实驱动下这是
   * 「部分 op 已落库」的方向，但整批无法判定，保守地全部计入失败；函数不抛异常且落一条 warn
   */
  it('T2-7: 整体抛错时全部计入失败且不抛异常', async () => {
    const updates = makeUpdates(3);
    const bulkError = new Error('mongo down');
    mockBulkWrite.mockRejectedValueOnce(bulkError);

    await expect(bulkUpdateCollectionsParent({ teamId, updates })).resolves.toEqual({
      successIds: [],
      failedIds: updates.map((item) => item._id),
      matchedCount: 0
    });
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn.mock.calls[0]).toEqual([
      'Bulk update collection parent failed',
      { teamId, count: 3, error: bulkError }
    ]);
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（边界场景）: updates 为空时不触发 bulkWrite，返回空结果
   */
  it('T2-8: 空输入不触发 bulkWrite', async () => {
    const result = await bulkUpdateCollectionsParent({ teamId, updates: [] });

    expect(mockBulkWrite).not.toHaveBeenCalled();
    expect(result).toEqual({ successIds: [], failedIds: [], matchedCount: 0 });
  });
});

describe('bulkMoveCollectionsParent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPermissionEnabled.mockResolvedValue(true);
    mockFindByResource.mockResolvedValue([]);
    mockFindByResourceIds.mockResolvedValue([]);
    mockReplaceResources.mockResolvedValue(undefined);
  });

  /**
   * 被测函数名: bulkMoveCollectionsParent  等级: 3-High
   * 思路（正常场景）: ACL 重算与 parentId 写入都成功时返回批量更新结果，不触发回滚。
   */
  it('T2-14: ACL 与 parentId 全部迁移成功时正常返回', async () => {
    const items = makeMoveItems(2);
    mockBulkWrite.mockResolvedValue({ matchedCount: 2 });

    await expect(
      bulkMoveCollectionsParent({ teamId, items, session: {} as ClientSession })
    ).resolves.toEqual({
      successIds: items.map((item) => item._id),
      failedIds: [],
      matchedCount: 2
    });
    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
  });

  /**
   * 被测函数名: bulkMoveCollectionsParent  等级: 3-High
   * 思路（异常场景）: mongoose 在 ordered:false 下可只跳过校验失败的 op；组合迁移必须抛错，
   * 让外层事务回滚此前已经写入的 ACL，不能留下「ACL 新父级、parentId 旧父级」。
   */
  it('T2-15: 任一 parentId 写入失败时抛错触发事务回滚', async () => {
    const items = makeMoveItems(2);
    mockBulkWrite.mockResolvedValue({
      matchedCount: 1,
      mongoose: { results: [null, new Error('cast failed')] }
    });

    await expect(
      bulkMoveCollectionsParent({ teamId, items, session: {} as ClientSession })
    ).rejects.toThrow('Bulk move collection parent failed: expected=2, matched=1, failed=1');
    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
  });

  /**
   * 被测函数名: bulkMoveCollectionsParent  等级: 3-High
   * 思路（并发边界）: 快照读取后目标 collection 被删/重建时 bulkWrite 不报错但 matchedCount 变少；
   * 仍须抛错回滚 ACL，不能把未命中的静默空操作当成迁移成功。
   */
  it('T2-16: parentId 写入未完全命中时抛错触发事务回滚', async () => {
    const items = makeMoveItems(2);
    mockBulkWrite.mockResolvedValue({ matchedCount: 1 });

    await expect(
      bulkMoveCollectionsParent({ teamId, items, session: {} as ClientSession })
    ).rejects.toThrow('Bulk move collection parent failed: expected=2, matched=1, failed=0');
    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
  });
});

describe('createApiFileCollectionsBatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateTrainingUsage.mockResolvedValue({ usageId: 'usage-1' });
    mockInsertMany.mockResolvedValue({});
    mockTrainingInsertMany.mockResolvedValue([]);
    // 默认关闭态：本组用例断言的是落库文档内容，ACL 由 T2-13 单独覆盖
    mockPermissionEnabled.mockResolvedValue(false);
  });

  /**
   * 被测函数名: createApiFileCollectionsBatch  等级: 3-High
   * 思路（回归场景）: 解析队列路径在创建时并不切块，但 collection 行是 chunkSize / indexSize
   * 的**唯一载体** —— 解析阶段读 `collection.chunkSize` 切块（datasetParse），向量阶段读
   * `collection.indexSize` 定索引长度（datasetParse → generateVector）。
   * 若创建时把这两个字段置空，解析会回退到 rawText2Chunks 的默认 512、向量回退到模型最大
   * 索引长度，而不是本次请求算出的自动值（chunkAutoChunkSize = 1000）——
   * 直接改变切分粒度、索引成本与召回效果，且不报错。
   * 本用例钉住：insertMany 写入的文档必须带上计算后的 chunkSize / indexSize。
   */
  it('T2-10: 落库文档带上计算后的 chunkSize / indexSize', async () => {
    const { formatCreateCollectionParams } = await formatCollectionParamsByDataset({
      dataset: makeDataset(),
      createCollectionParams: {}
    });

    // 前提校验：自动模式下确实算出了非空值（否则本用例不具备判别力）
    expect(formatCreateCollectionParams.chunkSize).toBe(chunkAutoChunkSize);
    expect(formatCreateCollectionParams.indexSize).toBeDefined();

    await createApiFileCollectionsBatch({
      dataset: makeDataset(),
      files: [makeFile('f-1')],
      createCollectionParams: {},
      session: {} as any
    });

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0].chunkSize).toBe(formatCreateCollectionParams.chunkSize);
    expect(docs[0].indexSize).toBe(formatCreateCollectionParams.indexSize);
    expect(docs[0].chunkSize).toBe(chunkAutoChunkSize);
    expect(mockTrainingInsertMany).toHaveBeenCalledWith(
      [expect.objectContaining({ collectionId: expect.any(String), mode: 'parse' })],
      { session: {}, ordered: true }
    );
  });

  /**
   * 被测函数名: createApiFileCollectionsBatch  等级: 3-High
   * 思路（回归场景）: 批量路径曾把 tags 强制置为 undefined，导致
   * CreateApiCollectionV2BodySchema 支持的 tags 在批量导入时被静默丢弃（旧逐文件路径会保存）。
   * 标签是请求级参数，整批应写入同一份解析结果。
   */
  it('T2-11: 落库文档带上请求级 tags 的解析结果', async () => {
    const resolvedTags = [{ tagId: 'tag-id-1', value: ['t-1'] }];
    mockCreateOrGetCollectionTags.mockResolvedValue(resolvedTags as any);

    await createApiFileCollectionsBatch({
      dataset: makeDataset(),
      files: [makeFile('f-1'), makeFile('f-2')],
      createCollectionParams: { tags: ['t-1'] } as any,
      session: {} as any
    });

    // 标签是请求级参数，整批只解析一次
    expect(mockCreateOrGetCollectionTags).toHaveBeenCalledTimes(1);
    expect(mockCreateOrGetCollectionTags.mock.calls[0][0]).toMatchObject({ tags: ['t-1'] });

    const [docs] = mockInsertMany.mock.calls[0];
    // 关键断言：展开的 formatCreateCollectionParams 里的原始 tags 必须被解析结果覆盖，不能是 undefined
    expect(docs[0].tags).toEqual(resolvedTags);
    expect(docs[1].tags).toEqual(resolvedTags);
  });

  /**
   * 被测函数名: createApiFileCollectionsBatch  等级: 3-High
   * 思路（回归场景）: 同 T2-12，只是 file 路径。file 走整批事务，ACL 也必须在事务内用同一
   * session 写入，否则事务回滚后只剩 ACL 行（或反之）——两种残留在启用态下都是脏数据。
   */
  it('T2-13: 启用集合权限时，file 的 ACL 用同一 session 写入', async () => {
    mockPermissionEnabled.mockResolvedValue(true);
    mockFindByResource.mockResolvedValue([]);
    const session = {} as any;

    await createApiFileCollectionsBatch({
      dataset: makeDataset(),
      files: [makeFile('f-1'), makeFile('f-2')],
      // teamId / tmbId 由 createCollectionParams 带入，ACL 的 owner 行取自这里
      createCollectionParams: { teamId, tmbId } as any,
      session
    });

    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
    const call = mockReplaceResources.mock.calls[0][0];
    expect(call.session).toBe(session);
    expect(call.resources).toHaveLength(2);
    // 每个 file 都要有自己的 owner 快照；缺失即该文件对非 owner 不可见
    for (const resource of call.resources) {
      expect(resource.collaborators).toEqual([
        expect.objectContaining({ tmbId, permission: OwnerRoleVal })
      ]);
    }
    // collectionId 必须与 insertMany 落库的 _id 对齐，否则快照挂在不存在的资源上
    const [docs] = mockInsertMany.mock.calls[0];
    expect(call.resources.map((item: { resourceId: string }) => item.resourceId)).toEqual(
      docs.map((doc: { _id: string }) => String(doc._id))
    );
  });

  /**
   * 被测函数名: createApiFileCollectionsBatch  等级: 3-High
   * 思路（回归场景）: file 的 inheritPermission 曾整批取请求级值，于是「展开出的后代文件」也
   * 全落独立态 —— 给选中的上层目录授权不会传给它们，4w 规模的导入变成逐个维护 ACL。
   * 正确口径是逐文件取值：只有调用方标记为选中的那些文件落独立态，其余保持继承。
   * 本用例钉住落库文档与 ACL 快照都按**文件自身**的取值分支。
   */
  it('T2-18: file 的 inheritPermission 逐文件取值，缺省保持继承', async () => {
    mockPermissionEnabled.mockResolvedValue(true);
    // 父级快照非空才有判别力：继承态文件必须合并它，独立态文件必须无视它
    mockFindByResource.mockResolvedValue([{ tmbId: 'parent-tmb', permission: OwnerRoleVal }]);

    await createApiFileCollectionsBatch({
      dataset: makeDataset(),
      files: [
        { ...makeFile('f-selected'), inheritPermission: false },
        // 展开出的后代：调用方不标记，应保持继承
        makeFile('f-descendant')
      ],
      createCollectionParams: { teamId, tmbId } as any,
      session: {} as any
    });

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0]).toMatchObject({ inheritPermission: false });
    expect(docs[1].inheritPermission).not.toBe(false);

    const call = mockReplaceResources.mock.calls[0][0];
    const collaboratorsOf = (id: unknown) =>
      call.resources.find((item: { resourceId: string }) => item.resourceId === String(id))
        .collaborators;
    // 独立态：父级贡献不参与，只有 owner
    expect(collaboratorsOf(docs[0]._id)).toEqual([
      expect.objectContaining({ tmbId, permission: OwnerRoleVal })
    ]);
    // 继承态：合并父级快照
    expect(collaboratorsOf(docs[1]._id)).toHaveLength(2);
  });
});
