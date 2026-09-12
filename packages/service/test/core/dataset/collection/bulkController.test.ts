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
  bulkInsertCollections,
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

describe('bulkInsertCollections', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  /**
   * 被测函数名: bulkInsertCollections  等级: 3-High
   * 思路（正常场景）: 600 条 docs 按 API_FILE_FOLDER_BATCH_SIZE 分两批 insertMany（500 / 100），
   * 全部 apiFileId 计入成功且成功写入 teamId/tmbId/datasetId
   */
  it('T2-1: 600 条按批大小分两批写入并全部计入成功', async () => {
    const docs = makeDocs(600);
    mockInsertMany.mockResolvedValue([]);

    const result = await bulkInsertCollections({ teamId, tmbId, datasetId, docs });

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
   * 被测函数名: bulkInsertCollections  等级: 3-High
   * 思路（异常场景）: 第 2 批 insertMany 抛错，回查发现该批仅 docs[500] 落库，
   * 已落库项必须计入成功，其余 99 条计入失败（不能整批标失败产生幽灵缺失）
   */
  it('T2-2: 批失败后按 _id 回查，已落库项计入成功', async () => {
    const docs = makeDocs(600);
    mockInsertMany.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('batch failed'));
    mockFindLanded([{ _id: docs[500]._id }]);

    const result = await bulkInsertCollections({ teamId, tmbId, datasetId, docs });

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
   * 被测函数名: bulkInsertCollections  等级: 3-High
   * 思路（异常场景）: insertMany 抛错且回查为空，该批全部计入失败
   */
  it('T2-3: 整批失败且回查为空时全部计入失败', async () => {
    const docs = makeDocs(10);
    mockInsertMany.mockRejectedValueOnce(new Error('write failed'));
    mockFindLanded([]);

    const result = await bulkInsertCollections({ teamId, tmbId, datasetId, docs });

    expect(result.successApiFileIds).toEqual([]);
    expect(result.failedApiFileIds).toEqual(docs.map((doc) => doc.apiFileId));
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  /**
   * 被测函数名: bulkInsertCollections  等级: 3-High
   * 思路（边界场景）: docs 为空时不触发 insertMany，返回空结果
   */
  it('T2-4: 空输入不触发 insertMany', async () => {
    const result = await bulkInsertCollections({ teamId, tmbId, datasetId, docs: [] });

    expect(mockInsertMany).not.toHaveBeenCalled();
    expect(result).toEqual({ successApiFileIds: [], failedApiFileIds: [] });
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
    mockBulkWrite.mockResolvedValue({ writeErrors: [] });

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
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（异常场景）: bulkWrite 返回 writeErrors[{index:1}]，只把第 2 条还原为失败
   */
  it('T2-6: 部分失败按 writeErrors.index 还原失败项', async () => {
    const updates = makeUpdates(2);
    mockBulkWrite.mockResolvedValue({ writeErrors: [{ index: 1 }] });

    const result = await bulkUpdateCollectionsParent({ teamId, updates });

    expect(result.successIds).toEqual([updates[0]._id]);
    expect(result.failedIds).toEqual([updates[1]._id]);
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（异常场景）: bulkWrite 整体 reject，全部计入失败且函数不抛异常
   */
  it('T2-7: 整体抛错时全部计入失败且不抛异常', async () => {
    const updates = makeUpdates(3);
    mockBulkWrite.mockRejectedValueOnce(new Error('mongo down'));

    await expect(bulkUpdateCollectionsParent({ teamId, updates })).resolves.toEqual({
      successIds: [],
      failedIds: updates.map((item) => item._id)
    });
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  /**
   * 被测函数名: bulkUpdateCollectionsParent  等级: 3-High
   * 思路（边界场景）: updates 为空时不触发 bulkWrite，返回空结果
   */
  it('T2-8: 空输入不触发 bulkWrite', async () => {
    const result = await bulkUpdateCollectionsParent({ teamId, updates: [] });

    expect(mockBulkWrite).not.toHaveBeenCalled();
    expect(result).toEqual({ successIds: [], failedIds: [] });
  });
});
