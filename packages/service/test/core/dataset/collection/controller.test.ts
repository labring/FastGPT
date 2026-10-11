import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type {
  BulkInsertCollectionDoc,
  BulkMoveCollectionParentItem,
  BulkUpdateCollectionParentItem
} from '@fastgpt/service/core/dataset/collection/controller';

const {
  mockInsertMany,
  mockFind,
  mockBulkWrite,
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
    getLLMModelData: () => ({
      modelId: 'agent-model',
      config: { maxContext: 8000, maxResponse: 1000 }
    }),
    getEmbeddingModelData: () => ({
      modelId: 'embedding-model',
      config: { defaultToken: 100, maxToken: 100, weight: 0 }
    }),
    getVlmModelData: () => undefined
  })
}));

// 复用全局 logger mock，仅监听本文件需要断言的告警。
const mockWarn = vi.spyOn(getLogger(LogCategories.MODULE.DATASET), 'warn');

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
import { DatasetCollectionSchema } from '@fastgpt/global/core/dataset/type';

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
const makeFile = (
  apiFileId: string
): Parameters<typeof createApiFileCollectionsBatch>[0]['files'][number] => ({
  name: apiFileId,
  apiFileId
});
const collectionParams = { teamId, tmbId, datasetId, type: DatasetCollectionTypeEnum.apiFile };

describe('bulkInsertFolderCollections', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 默认关闭态：本组用例断言的是 insertMany 本身，ACL 写入由 T2-12 单独覆盖
    mockPermissionEnabled.mockResolvedValue(false);
  });

  it('600 条按批大小分两批写入并全部计入成功', async () => {
    const docs = makeDocs(600);
    docs[0].parentId = new Types.ObjectId();
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

  it('批失败后按 _id 回查，已落库项计入成功', async () => {
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
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('整批失败且回查为空时全部计入失败', async () => {
    const docs = makeDocs(10);
    mockInsertMany.mockRejectedValueOnce(new Error('write failed'));
    mockFindLanded([]);

    const result = await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs });

    expect(result.successApiFileIds).toEqual([]);
    expect(result.failedApiFileIds).toEqual(docs.map((doc) => doc.apiFileId));
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('空输入不触发 insertMany', async () => {
    const result = await bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs: [] });

    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(result).toEqual({ successApiFileIds: [], failedApiFileIds: [] });
  });

  it('回查失败时整批计入失败且不抛异常', async () => {
    const docs = makeDocs(10);
    const insertError = new Error('write failed');
    const recoveryError = new Error('mongo down');
    mockInsertMany.mockRejectedValueOnce(insertError);
    mockFind.mockReturnValue({ lean: vi.fn().mockRejectedValue(recoveryError) });

    await expect(bulkInsertFolderCollections({ teamId, tmbId, datasetId, docs })).resolves.toEqual({
      successApiFileIds: [],
      failedApiFileIds: docs.map((doc) => doc.apiFileId)
    });
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        teamId,
        datasetId,
        batchSize: 10,
        error: insertError,
        recoveryError
      })
    );
  });

  it('inheritPermission=false 的目录落库独立态，ACL 只有 owner', async () => {
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

    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
    const call = mockReplaceResources.mock.calls[0][0];
    expect(call.resourceType).toBe(PerResourceTypeEnum.collection);
    expect(call.session).toBe(mockInsertMany.mock.calls[0][1].session);
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

  it('一次 bulkWrite 完成 2 条层级校正', async () => {
    const updates = makeUpdates(2);
    updates[1] = { ...updates[1], parentId: null, apiFileParentId: null };
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
    expect(mockBulkWrite.mock.calls[0][0][1].updateOne.update).toEqual({
      $set: { parentId: null },
      $unset: { apiFileParentId: 1 }
    });
    expect(result.successIds).toEqual(updates.map((item) => item._id));
    expect(result.failedIds).toEqual([]);
    expect(result.matchedCount).toBe(2);
  });

  it.each([1, undefined])(
    '目标未完全命中或驱动省略计数时保留 matchedCount：%s',
    async (matchedCount) => {
      const updates = makeUpdates(3);
      // 3 条 op 只有 1 条命中（另外 2 条的 _id 已被删除/重建）
      mockBulkWrite.mockResolvedValue({ writeErrors: [], matchedCount });

      const result = await bulkUpdateCollectionsParent({ teamId, updates });

      expect(result.matchedCount).toBe(matchedCount ?? 0);
      expect(result.successIds).toEqual(updates.map((item) => item._id));
    }
  );

  it('单条 _id cast 失败时未执行的 op 计入 failedIds 而非 successIds', async () => {
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

  it.each(['previous-api-parent', null, undefined])(
    '移到远端根目录时清除旧父字段，兼容详情 schema：%s',
    async (previousApiFileParentId) => {
      const { MongoDatasetCollection: RealMongoDatasetCollection } = await vi.importActual<
        typeof import('@fastgpt/service/core/dataset/collection/schema')
      >('@fastgpt/service/core/dataset/collection/schema');
      const realTeamId = String(new Types.ObjectId());
      const created = await RealMongoDatasetCollection.create({
        teamId: realTeamId,
        tmbId: String(new Types.ObjectId()),
        datasetId: String(new Types.ObjectId()),
        type: DatasetCollectionTypeEnum.apiFile,
        name: 'move-to-root',
        parentId: new Types.ObjectId(),
        apiFileParentId: previousApiFileParentId ?? undefined
      });
      if (previousApiFileParentId === null) {
        // 模拟早期层级校正写入的 null，验证再次同步可以恢复接口兼容性。
        await RealMongoDatasetCollection.collection.updateOne(
          { _id: new Types.ObjectId(created._id) },
          { $set: { apiFileParentId: null } }
        );
      }
      mockBulkWrite.mockImplementation((ops, options) =>
        RealMongoDatasetCollection.bulkWrite(ops, options)
      );

      const result = await bulkUpdateCollectionsParent({
        teamId: realTeamId,
        updates: [{ _id: String(created._id), parentId: null, apiFileParentId: null }]
      });
      const saved = await RealMongoDatasetCollection.findById(created._id).lean();

      expect(result).toEqual({ successIds: [String(created._id)], failedIds: [], matchedCount: 1 });
      expect(saved?.parentId).toBeNull();
      expect(saved).not.toHaveProperty('apiFileParentId');
      expect(
        DatasetCollectionSchema.shape.apiFileParentId.safeParse(saved?.apiFileParentId).success
      ).toBe(true);
    }
  );

  it('整体抛错时全部计入失败且不抛异常', async () => {
    const updates = makeUpdates(3);
    const bulkError = new Error('mongo down');
    mockBulkWrite.mockRejectedValueOnce(bulkError);

    await expect(bulkUpdateCollectionsParent({ teamId, updates })).resolves.toEqual({
      successIds: [],
      failedIds: updates.map((item) => item._id),
      matchedCount: 0
    });
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0]).toEqual([
      'Bulk update collection parent failed',
      { teamId, count: 3, error: bulkError }
    ]);
  });

  it('空输入不触发 bulkWrite', async () => {
    const result = await bulkUpdateCollectionsParent({ teamId, updates: [] });

    expect(mockBulkWrite).not.toHaveBeenCalled();
    expect(result).toEqual({ successIds: [], failedIds: [], matchedCount: 0 });
  });
});

describe('bulkMoveCollectionsParent', () => {
  it('空移动不执行 ACL 或 collection 写入', async () => {
    await expect(
      bulkMoveCollectionsParent({ teamId, items: [], session: {} as ClientSession })
    ).resolves.toEqual({ successIds: [], failedIds: [], matchedCount: 0 });
    expect(mockBulkWrite).not.toHaveBeenCalled();
    expect(mockReplaceResources).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockPermissionEnabled.mockResolvedValue(true);
    mockFindByResource.mockResolvedValue([]);
    mockFindByResourceIds.mockResolvedValue([]);
    mockReplaceResources.mockResolvedValue(undefined);
    mockFind.mockReturnValue({ session: () => ({ lean: async () => [] }) });
  });

  it('ACL 与 parentId 全部迁移成功时正常返回', async () => {
    const items = makeMoveItems(2);
    items[0] = { ...items[0], newParentId: null, apiFileParentId: null };
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

  it('任一 parentId 写入失败时抛错触发事务回滚', async () => {
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

  it('parentId 写入未完全命中时抛错触发事务回滚', async () => {
    const items = makeMoveItems(2);
    mockBulkWrite.mockResolvedValue({ matchedCount: 1 });

    await expect(
      bulkMoveCollectionsParent({ teamId, items, session: {} as ClientSession })
    ).rejects.toThrow('Bulk move collection parent failed: expected=2, matched=1, failed=0');
    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
  });
});

describe('formatCollectionParamsByDataset', () => {
  it('旧 auto 模式转换为 chunk 并开启自动索引', async () => {
    const result = await formatCollectionParamsByDataset({
      dataset: makeDataset(),
      createCollectionParams: {
        ...collectionParams,
        trainingType: DatasetCollectionDataProcessModeEnum.auto
      }
    });
    expect(result.trainingType).toBe(DatasetCollectionDataProcessModeEnum.chunk);
    expect(result.formatCreateCollectionParams).toMatchObject({
      trainingType: DatasetCollectionDataProcessModeEnum.chunk,
      autoIndexes: true,
      chunkSize: chunkAutoChunkSize,
      indexSize: 100
    });
  });

  it.each([
    { mode: DatasetCollectionDataProcessModeEnum.qa, keepChunk: true },
    { mode: DatasetCollectionDataProcessModeEnum.backup, keepChunk: false },
    { mode: DatasetCollectionDataProcessModeEnum.template, keepChunk: false }
  ])('$mode 清理互斥字段，并保留该模式需要的参数', async ({ mode, keepChunk }) => {
    const { formatCreateCollectionParams: params } = await formatCollectionParamsByDataset({
      dataset: makeDataset(),
      createCollectionParams: {
        ...collectionParams,
        trainingType: mode,
        qaPrompt: '提取问答',
        chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
        chunkTriggerMinSize: 100,
        dataEnhanceCollectionName: true,
        imageIndex: true,
        autoIndexes: true,
        indexPrefixTitle: true
      }
    });
    for (const key of [
      'chunkTriggerType',
      'chunkTriggerMinSize',
      'dataEnhanceCollectionName',
      'imageIndex',
      'autoIndexes'
    ])
      expect(params).not.toHaveProperty(key);
    if (keepChunk) {
      expect(params).toMatchObject({ qaPrompt: '提取问答', chunkSize: 7000, indexSize: 100 });
    } else {
      for (const key of [
        'qaPrompt',
        'paragraphChunkAIMode',
        'paragraphChunkDeep',
        'paragraphChunkMinSize',
        'chunkSplitMode',
        'chunkSize',
        'chunkSplitter',
        'indexSize',
        'indexPrefixTitle'
      ])
        expect(params).not.toHaveProperty(key);
    }
  });
});

describe('createApiFileCollectionsBatch', () => {
  it('空文件不解析标签、不创建账单或队列', async () => {
    await expect(
      createApiFileCollectionsBatch({
        dataset: makeDataset(),
        files: [],
        createCollectionParams: collectionParams,
        session: {} as ClientSession
      })
    ).resolves.toEqual({ collectionIds: [] });
    expect(mockCreateOrGetCollectionTags).not.toHaveBeenCalled();
    expect(mockCreateTrainingUsage).not.toHaveBeenCalled();
    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockTrainingInsertMany).not.toHaveBeenCalled();
  });

  it('集合写入失败时向事务调用方抛错，且不创建 ACL 和解析队列', async () => {
    const error = new Error('insert failed');
    mockInsertMany.mockRejectedValueOnce(error);
    await expect(
      createApiFileCollectionsBatch({
        dataset: makeDataset(),
        files: [makeFile('f')],
        createCollectionParams: collectionParams,
        session: {} as ClientSession
      })
    ).rejects.toBe(error);
    expect(mockReplaceResources).not.toHaveBeenCalled();
    expect(mockTrainingInsertMany).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateTrainingUsage.mockResolvedValue({ usageId: 'usage-1' });
    mockInsertMany.mockResolvedValue({});
    mockTrainingInsertMany.mockResolvedValue([]);
    // 默认关闭态：本组用例断言的是落库文档内容，ACL 由 T2-13 单独覆盖
    mockPermissionEnabled.mockResolvedValue(false);
  });

  it('落库文档带上计算后的 chunkSize / indexSize', async () => {
    await createApiFileCollectionsBatch({
      dataset: makeDataset(),
      files: [makeFile('f-1')],
      createCollectionParams: collectionParams,
      session: {} as any
    });

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0].indexSize).toBe(100);
    expect(docs[0].chunkSize).toBe(chunkAutoChunkSize);
    expect(mockTrainingInsertMany).toHaveBeenCalledWith(
      [expect.objectContaining({ collectionId: expect.any(String), mode: 'parse' })],
      { session: {}, ordered: true }
    );
  });

  it('落库文档带上请求级 tags 的解析结果', async () => {
    const resolvedTags = [{ tagId: 'tag-id-1', value: ['t-1'] }];
    mockCreateOrGetCollectionTags.mockResolvedValue(resolvedTags as any);

    await createApiFileCollectionsBatch({
      dataset: makeDataset(),
      files: [makeFile('f-1'), makeFile('f-2')],
      createCollectionParams: { ...collectionParams, tags: ['t-1'] },
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

  it('file 的 inheritPermission 逐文件取值，缺省保持继承', async () => {
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
      createCollectionParams: collectionParams,
      session: {} as any
    });

    const [docs] = mockInsertMany.mock.calls[0];
    expect(docs[0]).toMatchObject({ inheritPermission: false });
    expect(docs[1].inheritPermission).not.toBe(false);

    expect(mockReplaceResources).toHaveBeenCalledTimes(1);
    const call = mockReplaceResources.mock.calls[0][0];
    expect(call.session).toBe(mockInsertMany.mock.calls[0][1].session);
    expect(call.resources.map((item: { resourceId: string }) => item.resourceId)).toEqual(
      docs.map((doc: { _id: Types.ObjectId }) => String(doc._id))
    );
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
