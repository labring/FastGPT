import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  BulkInsertCollectionDoc,
  BulkUpdateCollectionParentItem
} from '@fastgpt/service/core/dataset/collection/controller';

const { mockInsertMany, mockFind, mockBulkWrite, mockLogger } = vi.hoisted(() => ({
  mockInsertMany: vi.fn(),
  mockFind: vi.fn(),
  mockBulkWrite: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
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

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/logger')>();
  return { ...actual, getLogger: () => mockLogger };
});

import {
  API_FILE_FILE_BATCH_SIZE,
  API_FILE_FOLDER_BATCH_SIZE,
  bulkInsertFolderCollections,
  bulkUpdateCollectionsParent
} from '@fastgpt/service/core/dataset/collection/controller';

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
