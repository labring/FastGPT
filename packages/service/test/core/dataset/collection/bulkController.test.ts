import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  BulkInsertCollectionDoc,
  BulkUpdateCollectionParentItem
} from '@fastgpt/service/core/dataset/collection/controller';

const {
  mockInsertMany,
  mockFind,
  mockBulkWrite,
  mockLogger,
  mockCreateTrainingUsage,
  mockTrainingInsertMany,
  mockCreateOrGetCollectionTags
} = vi.hoisted(() => ({
  mockInsertMany: vi.fn(),
  mockFind: vi.fn(),
  mockBulkWrite: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockCreateTrainingUsage: vi.fn(),
  mockTrainingInsertMany: vi.fn(),
  mockCreateOrGetCollectionTags: vi.fn()
}));

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
    // ordered:false 才会逐条落库，是回查语义的前提
    expect(mockInsertMany.mock.calls[0][1]).toEqual({ ordered: false });
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

describe('createApiFileCollectionsBatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateTrainingUsage.mockResolvedValue({ usageId: 'usage-1' });
    mockInsertMany.mockResolvedValue({});
    mockTrainingInsertMany.mockResolvedValue([]);
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
});
