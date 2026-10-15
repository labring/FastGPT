import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { Types, type ClientSession } from '@fastgpt/service/common/mongo';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import * as s3Utils from '@fastgpt/service/common/s3/utils';
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
  mockWriteResources
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
  mockWriteResources: vi.fn()
}));

// 开关要回查 dataset 文档、ACL 快照要读写 MongoResourcePermission：都是真库读写，且集合权限
// 生命周期本身由 support/permission 下的测试覆盖。此处只钉「批量路径有没有在**同一事务**里
// 初始化 ACL」，故替换掉这两处 IO。
vi.mock('@fastgpt/service/support/permission/collection/datasetSwitch', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatasetCollectionPermissionEnabled: mockPermissionEnabled,
  lockDatasetCollectionPermissionState: mockPermissionEnabled
}));
vi.mock(
  '@fastgpt/service/support/permission/repository/resourcePermissionRepo',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    resourcePermissionRepo: {
      findByResource: mockFindByResource,
      findByResourceIds: mockFindByResourceIds,
      replaceResources: mockWriteResources,
      insertResources: mockWriteResources
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
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTeamModelHandle: vi.fn(async () => ({
    getModelData: (
      _ref: unknown,
      options?: { type?: string; vision?: boolean; optional?: boolean }
    ) => {
      if (options?.vision) return undefined;
      if (options?.type === 'embedding') {
        return {
          modelId: 'embedding-model',
          config: { defaultToken: 100, maxToken: 100, weight: 0 }
        };
      }
      return {
        modelId: 'agent-model',
        config: { maxContext: 8000, maxResponse: 1000 }
      };
    }
  }))
}));

// 复用全局 logger mock，仅监听本文件需要断言的告警。
const mockWarn = vi.spyOn(getLogger(LogCategories.MODULE.DATASET), 'warn');

import {
  API_FILE_FILE_BATCH_SIZE,
  API_FILE_FOLDER_BATCH_SIZE,
  bulkInsertFolderCollections,
  bulkMoveCollectionsParent,
  bulkUpdateCollectionsParent,
  createCollections,
  createOneCollection,
  createApiFileCollectionsBatch,
  formatCollectionParamsByDataset
} from '@fastgpt/service/core/dataset/collection/controller';
import { chunkAutoChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { DatasetCollectionSchema } from '@fastgpt/global/core/dataset/type';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { createCollectionPermissionsBatch } from '@fastgpt/service/support/permission/collection/controller';

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
    // 集合与 ACL 共享事务；恢复查询用于处理不确定提交结果，写入使用有序批次。
    expect(mockInsertMany.mock.calls[0][1]).toMatchObject({ ordered: true });
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

    expect(mockWriteResources).toHaveBeenCalledTimes(1);
    const call = mockWriteResources.mock.calls[0][0];
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
    expect(mockWriteResources).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockPermissionEnabled.mockResolvedValue(true);
    mockFindByResource.mockResolvedValue([]);
    mockFindByResourceIds.mockResolvedValue([]);
    mockWriteResources.mockResolvedValue(undefined);
    mockFind.mockImplementation((query) => ({
      session: () => ({
        lean: async () =>
          (query._id?.$in ?? []).map((id: string) => ({
            _id: id,
            parentId: id.startsWith('collection-')
              ? `old-parent-${id.slice('collection-'.length)}`
              : null,
            type: DatasetCollectionTypeEnum.apiFile,
            inheritPermission: true
          }))
      })
    }));
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
    expect(mockWriteResources).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'parentId 未完全命中或写入失败时抛错触发事务回滚：cast 失败=%s',
    async (castFailed) => {
      const items = makeMoveItems(2);
      mockBulkWrite.mockResolvedValue({
        matchedCount: 1,
        ...(castFailed ? { mongoose: { results: [null, new Error('cast failed')] } } : {})
      });

      await expect(
        bulkMoveCollectionsParent({ teamId, items, session: {} as ClientSession })
      ).rejects.toThrow(
        `Bulk move collection parent failed: expected=2, matched=1, failed=${castFailed ? 1 : 0}`
      );
      expect(mockWriteResources).toHaveBeenCalledTimes(1);
    }
  );
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
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateTrainingUsage.mockResolvedValue({ usageId: 'usage-1' });
    mockInsertMany.mockImplementation(async (docs) => docs);
    mockTrainingInsertMany.mockResolvedValue([]);
    mockPermissionEnabled.mockResolvedValue(false);
  });

  it('200 个同父级文件复用模型、标签和 ACL 计算，并将结果整批写入集合与队列', async () => {
    const resolvedTags = [{ tagId: 'tag-id-1', value: ['t-1'] }];
    mockCreateOrGetCollectionTags.mockResolvedValue(resolvedTags);
    mockPermissionEnabled.mockResolvedValue(true);
    mockFindByResourceIds.mockResolvedValue([
      { resourceId: 'parent', tmbId: 'parent-owner', permission: OwnerRoleVal }
    ]);
    const files = Array.from({ length: 200 }, (_, index) => ({
      ...makeFile(`file-${index}`),
      parentId: 'parent'
    }));
    const result = await createApiFileCollectionsBatch({
      dataset: makeDataset(),
      files,
      createCollectionParams: { ...collectionParams, tags: ['t-1'] },
      session: {} as ClientSession
    });
    expect(result.collectionIds).toHaveLength(200);
    expect(getTeamModelHandle).toHaveBeenCalledExactlyOnceWith({ teamId });
    expect(mockCreateOrGetCollectionTags).toHaveBeenCalledTimes(1);
    expect(mockCreateOrGetCollectionTags.mock.calls[0][0]).toMatchObject({ tags: ['t-1'] });
    expect(mockInsertMany).toHaveBeenCalledTimes(1);
    const [docs] = mockInsertMany.mock.calls[0];
    for (const doc of docs) {
      expect(doc).toMatchObject({ indexSize: 100, chunkSize: chunkAutoChunkSize });
      expect(doc.tags).toEqual(resolvedTags);
    }
    expect(mockPermissionEnabled).toHaveBeenCalledTimes(1);
    expect(mockFindByResourceIds).toHaveBeenCalledExactlyOnceWith({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resourceIds: ['parent'],
      session: {}
    });
    expect(mockFindByResource).not.toHaveBeenCalled();
    expect(mockWriteResources).toHaveBeenCalledTimes(1);
    expect(mockWriteResources.mock.calls[0][0].resources).toHaveLength(200);
    expect(mockTrainingInsertMany).toHaveBeenCalledTimes(1);
    expect(mockTrainingInsertMany).toHaveBeenCalledWith(
      result.collectionIds.map((collectionId) =>
        expect.objectContaining({ collectionId, mode: 'parse', billId: 'usage-1' })
      ),
      { session: {}, ordered: true }
    );
    expect(mockCreateTrainingUsage).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: '缺省共享账单、内部事务',
      billing: undefined,
      session: undefined,
      names: ['first +1'],
      bills: ['first-bill', 'first-bill']
    },
    {
      name: '逐文件账单、调用方事务',
      billing: { mode: 'perFile' as const },
      session: {} as ClientSession,
      names: ['first', 'second'],
      bills: ['first-bill', 'second-bill']
    },
    {
      name: '复用已有账单、调用方事务',
      billing: { mode: 'shared' as const, billId: 'existing' },
      session: {} as ClientSession,
      names: [],
      bills: ['existing', 'existing']
    }
  ])(
    '$name：集合、ACL、账单及队列共用事务，账单逐项对应',
    async ({ billing, session, names, bills }) => {
      mockPermissionEnabled.mockResolvedValue(true);
      mockFindByResource.mockResolvedValue([]);
      mockCreateTrainingUsage
        .mockResolvedValueOnce({ usageId: 'first-bill' })
        .mockResolvedValueOnce({ usageId: 'second-bill' });
      const result = await createApiFileCollectionsBatch({
        dataset: makeDataset(),
        files: [makeFile('first'), makeFile('second')],
        createCollectionParams: collectionParams,
        billing,
        indexLimitEstimate: 0,
        session
      });
      expect(result.collectionIds).toHaveLength(2);
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockWriteResources).toHaveBeenCalledTimes(1);
      expect(mockCreateTrainingUsage.mock.calls.map(([args]) => args.appName)).toEqual(names);
      const transaction = mockInsertMany.mock.calls[0][1].session;
      if (session) expect(transaction).toBe(session);
      expect(mockWriteResources.mock.calls[0][0].session).toBe(transaction);
      for (const [args] of mockCreateTrainingUsage.mock.calls)
        expect(args.session).toBe(transaction);
      expect(mockTrainingInsertMany).toHaveBeenCalledExactlyOnceWith(
        result.collectionIds.map((collectionId, index) =>
          expect.objectContaining({ collectionId, billId: bills[index] })
        ),
        { session: transaction, ordered: true }
      );
    }
  );

  it.each([
    { stage: 'bill', write: mockCreateTrainingUsage },
    { stage: 'collection', write: mockInsertMany },
    { stage: 'acl', write: mockWriteResources },
    { stage: 'queue', write: mockTrainingInsertMany }
  ])('$stage 写入失败向事务调用方抛错，停止后续写入', async ({ stage, write }) => {
    const error = new Error(`${stage} failed`);
    mockPermissionEnabled.mockResolvedValue(true);
    mockFindByResource.mockResolvedValue([]);
    write.mockRejectedValueOnce(error);
    await expect(
      createApiFileCollectionsBatch({
        dataset: makeDataset(),
        files: [makeFile('f')],
        createCollectionParams: collectionParams,
        session: {} as ClientSession
      })
    ).rejects.toBe(error);
    if (stage !== 'queue') expect(mockTrainingInsertMany).not.toHaveBeenCalled();
    if (stage === 'collection') expect(mockWriteResources).not.toHaveBeenCalled();
  });

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

    expect(mockWriteResources).toHaveBeenCalledTimes(1);
    const call = mockWriteResources.mock.calls[0][0];
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

describe('createCollections / createOneCollection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockInsertMany.mockImplementation(async (docs) => docs);
    mockPermissionEnabled.mockResolvedValue(false);
  });

  it('空批次不解析标签、不读写 ACL 或创建集合', async () => {
    expect(await createCollections({ collections: [] })).toEqual([]);
    expect(mockCreateOrGetCollectionTags).not.toHaveBeenCalled();
    expect(mockPermissionEnabled).not.toHaveBeenCalled();
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it('标签解析失败时不创建集合、ACL 或队列', async () => {
    const error = new Error('invalid tag');
    mockCreateOrGetCollectionTags.mockRejectedValueOnce(error);
    await expect(
      createCollections({
        collections: [{ ...collectionParams, name: 'tagged', tags: ['invalid'] }],
        session: {} as ClientSession
      })
    ).rejects.toBe(error);
    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(mockPermissionEnabled).not.toHaveBeenCalled();
  });

  it('不同团队的集合分别处理权限开关，避免混用快照', async () => {
    await createCollections({
      collections: [
        { ...collectionParams, name: 'one' },
        { ...collectionParams, name: 'two', teamId: 'other-team', datasetId: 'other-dataset' }
      ],
      session: {} as ClientSession
    });
    expect(mockPermissionEnabled.mock.calls.map(([args]) => [args.teamId, args.datasetId])).toEqual(
      [
        [teamId, datasetId],
        ['other-team', 'other-dataset']
      ]
    );
  });

  it('单条创建共用批量落库，规范化根父级并忽略外部 _id，关闭态不读写 ACL', async () => {
    const injectedId = new Types.ObjectId();
    const input = { ...collectionParams, name: 'single', parentId: '', _id: injectedId };
    const collection = await createOneCollection(input);
    expect(String(collection._id)).not.toBe(String(injectedId));
    expect(collection).toMatchObject({ name: 'single', parentId: null });
    expect(mockPermissionEnabled).toHaveBeenCalledTimes(1);
    expect(mockFindByResource).not.toHaveBeenCalled();
    expect(mockFindByResourceIds).not.toHaveBeenCalled();
    expect(mockWriteResources).not.toHaveBeenCalled();
  });

  it('不同标签分组独立解析，相同标签只解析一次且不修改输入', async () => {
    mockCreateOrGetCollectionTags
      .mockResolvedValueOnce([{ tagId: 'first', value: ['a'] }])
      .mockResolvedValueOnce([{ tagId: 'second', value: ['b'] }]);
    const inputs = ['a', 'a', 'b'].map((tag, index) => ({
      ...collectionParams,
      name: String(index),
      tags: [tag]
    }));
    const result = await createCollections({ collections: inputs, session: {} as ClientSession });
    expect(mockCreateOrGetCollectionTags).toHaveBeenCalledTimes(2);
    expect(result.map((item) => item.tags)).toEqual([
      [{ tagId: 'first', value: ['a'] }],
      [{ tagId: 'first', value: ['a'] }],
      [{ tagId: 'second', value: ['b'] }]
    ]);
    expect(inputs.map((item) => item.tags)).toEqual([['a'], ['a'], ['b']]);
  });

  it('同批父子节点在写入前拒绝，避免创建尚不存在的父级 ACL 快照', async () => {
    const parentId = new Types.ObjectId();
    await expect(
      createCollections({
        collections: [
          {
            ...collectionParams,
            name: 'parent',
            _id: parentId,
            type: DatasetCollectionTypeEnum.folder
          },
          { ...collectionParams, name: 'child', parentId: String(parentId) }
        ],
        session: {} as ClientSession
      })
    ).rejects.toThrow('Collection batch parents must already exist');
    expect(mockInsertMany).not.toHaveBeenCalled();
  });

  it('权限关闭时独立态拒绝，只检查一次开关且不写 ACL', async () => {
    await expect(
      createCollections({
        collections: [{ ...collectionParams, name: 'independent', inheritPermission: false }],
        session: {} as ClientSession
      })
    ).rejects.toBe(DatasetErrEnum.collectionPermissionDisabled);
    expect(mockPermissionEnabled).toHaveBeenCalledTimes(1);
    expect(mockWriteResources).not.toHaveBeenCalled();
  });

  it('自有文件 TTL 去重处理，外库 key 保持原状', async () => {
    const removeTTL = vi.spyOn(s3Utils, 'removeS3TTL').mockResolvedValue(undefined);
    const ownKey = `dataset/${datasetId}/file.pdf`;
    await createCollections({
      collections: [
        { ...collectionParams, name: 'first', fileId: ownKey },
        { ...collectionParams, name: 'second', fileId: ownKey },
        { ...collectionParams, name: 'foreign', fileId: 'dataset/another/file.pdf' }
      ],
      session: {} as ClientSession
    });
    expect(removeTTL).toHaveBeenCalledExactlyOnceWith({
      key: ownKey,
      bucketName: 'private',
      session: {}
    });
    removeTTL.mockRestore();
  });
});

describe('createCollectionPermissionsBatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPermissionEnabled.mockResolvedValue(true);
    mockFindByResourceIds.mockResolvedValue([]);
    mockFindByResource.mockResolvedValue([]);
  });

  it('空资源列表无需读取开关或写入 ACL', async () => {
    await createCollectionPermissionsBatch({ teamId, resources: [], session: {} as ClientSession });
    expect(mockPermissionEnabled).not.toHaveBeenCalled();
    expect(mockWriteResources).not.toHaveBeenCalled();
  });

  it('全部为独立态时不读取父目录或知识库 ACL，不同 owner 的快照保持隔离', async () => {
    await createCollectionPermissionsBatch({
      teamId,
      resources: [
        { collectionId: 'first', datasetId, parentId: 'parent', tmbId, inheritPermission: false },
        {
          collectionId: 'second',
          datasetId,
          parentId: 'parent',
          tmbId: 'other-owner',
          inheritPermission: false
        }
      ],
      session: {} as ClientSession
    });
    expect(mockFindByResourceIds).not.toHaveBeenCalled();
    expect(mockFindByResource).not.toHaveBeenCalled();
    expect(mockWriteResources.mock.calls[0][0].resources).toEqual([
      { resourceId: 'first', collaborators: [{ tmbId, permission: OwnerRoleVal }] },
      { resourceId: 'second', collaborators: [{ tmbId: 'other-owner', permission: OwnerRoleVal }] }
    ]);
  });

  it('同父级下不同 owner 保留自身 owner 与父级继承贡献，不互相成为 owner', async () => {
    mockFindByResourceIds.mockResolvedValue([
      { resourceId: 'parent', tmbId: 'parent-owner', permission: OwnerRoleVal }
    ]);
    await createCollectionPermissionsBatch({
      teamId,
      resources: [
        { collectionId: 'first', datasetId, parentId: 'parent', tmbId },
        { collectionId: 'second', datasetId, parentId: 'parent', tmbId: 'other-owner' }
      ],
      session: {} as ClientSession
    });
    const snapshots = mockWriteResources.mock.calls[0][0].resources;
    expect(snapshots[0].collaborators).toContainEqual({ tmbId, permission: OwnerRoleVal });
    expect(snapshots[0].collaborators).not.toContainEqual({
      tmbId: 'other-owner',
      permission: OwnerRoleVal
    });
    expect(snapshots[1].collaborators).toContainEqual({
      tmbId: 'other-owner',
      permission: OwnerRoleVal
    });
    expect(snapshots[1].collaborators).not.toContainEqual({ tmbId, permission: OwnerRoleVal });
    expect(mockFindByResourceIds).toHaveBeenCalledTimes(1);
  });

  it('2100 个不同父级分三片读取，ACL 也分三片写入', async () => {
    const resources = Array.from({ length: 2100 }, (_, index) => ({
      collectionId: `file-${index}`,
      datasetId,
      parentId: `parent-${index}`,
      tmbId
    }));
    await createCollectionPermissionsBatch({ teamId, resources, session: {} as ClientSession });
    expect(mockPermissionEnabled).toHaveBeenCalledTimes(1);
    expect(mockFindByResource).not.toHaveBeenCalled();
    expect(mockFindByResourceIds.mock.calls.map(([args]) => args.resourceIds.length)).toEqual([
      1000, 1000, 100
    ]);
    expect(mockWriteResources.mock.calls.map(([args]) => args.resources.length)).toEqual([
      1000, 1000, 100
    ]);
  });

  it('混合知识库按开关分别处理，关闭态不写 ACL', async () => {
    mockPermissionEnabled.mockImplementation(async ({ datasetId }) => datasetId === 'enabled');
    await createCollectionPermissionsBatch({
      teamId,
      resources: [
        { collectionId: 'first', datasetId: 'enabled', parentId: null, tmbId },
        { collectionId: 'second', datasetId: 'disabled', parentId: null, tmbId }
      ],
      session: {} as ClientSession
    });
    expect(mockPermissionEnabled).toHaveBeenCalledTimes(2);
    expect(mockFindByResource).toHaveBeenCalledExactlyOnceWith({
      teamId,
      resourceType: PerResourceTypeEnum.dataset,
      resourceId: 'enabled',
      session: {}
    });
    expect(
      mockWriteResources.mock.calls[0][0].resources.map(
        (item: { resourceId: string }) => item.resourceId
      )
    ).toEqual(['first']);
  });
});
