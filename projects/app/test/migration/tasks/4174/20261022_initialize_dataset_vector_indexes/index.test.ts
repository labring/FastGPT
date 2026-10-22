import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { initializeDatasetVectorIndexes } from '@/migration/tasks/4174/20261022_initialize_dataset_vector_indexes';

const mocks = vi.hoisted(() => ({ count: vi.fn(), counted: vi.fn(), provider: 'pg' }));
vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({ getVectorCount: mocks.count }));
vi.mock('@fastgpt/service/core/dataset/vectorData/mq', () => ({
  onDatasetVectorCounted: mocks.counted
}));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => mocks.provider
}));
vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));

/** Context 只模拟断点持久化；读取顺序、软删除和类型过滤使用真实测试 Mongo。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  const context = {
    migrationId: '20261022_initialize_dataset_vector_indexes',
    runId: 'test',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    reportProgress: vi.fn(async () => {}),
    assertActive: vi.fn(async () => {}),
    getFailedRecords: vi.fn(async () => []),
    reportFailedRecords: vi.fn(async () => {}),
    fail: vi.fn(async () => {
      throw new Error('migration failed');
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, checkpoint: () => checkpoint };
};
const teamId = '507f1f77bcf86cd799439011';
const id = (n: number) => n.toString(16).padStart(24, '0');
const seed = (n: number, extra: Record<string, unknown> = {}) =>
  MongoDataset.create({
    _id: id(n),
    teamId,
    tmbId: new Types.ObjectId(),
    type: DatasetTypeEnum.dataset,
    name: 'vectors',
    ...extra
  });

beforeEach(() => {
  mocks.provider = 'pg';
  mocks.count.mockReset().mockResolvedValue(40000);
  mocks.counted.mockReset().mockResolvedValue(undefined);
});

describe('initializeDatasetVectorIndexes', () => {
  it('scans a fixed snapshot in batches, refreshes counts and only records delivered batches', async () => {
    await seed(1);
    await seed(2);
    await seed(3, { type: DatasetTypeEnum.folder });
    await seed(4, { deleteTime: new Date() });
    mocks.count.mockResolvedValueOnce(30000).mockResolvedValueOnce(30001);
    mocks.counted.mockImplementationOnce(async () => {
      await seed(9);
    });
    const { context, checkpoint } = createContext();
    expect(await initializeDatasetVectorIndexes(context)).toEqual({
      scannedCount: 2,
      eligibleCount: 1
    });
    expect(mocks.count.mock.calls).toEqual([
      [
        { teamId, datasetId: id(1) },
        { refresh: true, notifyDatasetCounted: false }
      ],
      [
        { teamId, datasetId: id(2) },
        { refresh: true, notifyDatasetCounted: false }
      ]
    ]);
    expect(mocks.counted).toHaveBeenCalledWith({ teamId, datasetId: id(2), rows: 30001 });
    expect(checkpoint()).toMatchObject({ lastId: id(2), endId: id(2) });
    expect(context.reportProgress).toHaveBeenLastCalledWith({
      key: 'datasets',
      status: 'succeeded'
    });
    expect(await initializeDatasetVectorIndexes(context)).toEqual({
      scannedCount: 2,
      eligibleCount: 1
    });
    expect(mocks.count).toHaveBeenCalledTimes(2);
  });

  it('does not advance past a failed queue delivery and resumes at the first uncommitted batch', async () => {
    await Promise.all([seed(1), seed(2), seed(3)]);
    mocks.counted
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('redis down'));
    const { context, checkpoint } = createContext();
    await expect(initializeDatasetVectorIndexes(context)).rejects.toThrow('redis down');
    expect(checkpoint()).toMatchObject({ lastId: id(2), scannedCount: 2 });
    expect(context.reportProgress).not.toHaveBeenCalledWith({
      key: 'datasets',
      status: 'succeeded'
    });
    expect(await initializeDatasetVectorIndexes(context)).toEqual({
      scannedCount: 3,
      eligibleCount: 3
    });
    expect(mocks.counted.mock.calls.map(([scope]) => scope.datasetId)).toEqual([
      id(1),
      id(2),
      id(3),
      id(3)
    ]);
  });

  it('safely replays a delivered batch after checkpoint persistence fails', async () => {
    await seed(1);
    const { context } = createContext();
    const save = context.saveCheckpoint.getMockImplementation()!;
    context.saveCheckpoint
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error('checkpoint write failed'));
    await expect(initializeDatasetVectorIndexes(context)).rejects.toThrow(
      'checkpoint write failed'
    );
    expect(await initializeDatasetVectorIndexes(context)).toEqual({
      scannedCount: 1,
      eligibleCount: 1
    });
    expect(mocks.counted.mock.calls.map(([scope]) => scope.datasetId)).toEqual([id(1), id(1)]);
  });

  it('does not enqueue or advance after losing the migration lease during COUNT', async () => {
    await seed(1);
    const { context, checkpoint } = createContext();
    mocks.count.mockImplementationOnce(async () => {
      context.assertActive.mockRejectedValue(new Error('lease lost'));
      return 40000;
    });
    await expect(initializeDatasetVectorIndexes(context)).rejects.toThrow('lease lost');
    expect(mocks.counted).not.toHaveBeenCalled();
    expect(checkpoint()?.lastId).toBeNull();
  });

  it('rejects invalid ownership without counting or enqueueing the record', async () => {
    await MongoDataset.collection.insertOne({
      _id: new Types.ObjectId(id(1)),
      name: 'bad',
      type: 'dataset'
    });
    const { context } = createContext();
    await expect(initializeDatasetVectorIndexes(context)).rejects.toThrow('invalid team ID');
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.counted).not.toHaveBeenCalled();
  });

  it.each([true, false])('handles empty databases and non-PG providers (%s)', async (pg) => {
    if (!pg) {
      mocks.provider = 'milvus';
      await seed(1);
    }
    const { context } = createContext();
    expect(await initializeDatasetVectorIndexes(context)).toEqual({
      scannedCount: 0,
      eligibleCount: 0
    });
    expect(context.reportProgress).toHaveBeenLastCalledWith({
      key: 'datasets',
      status: 'succeeded'
    });
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
