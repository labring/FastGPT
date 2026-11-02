import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { initializeDatasetVectorIndexes } from '@/migration/tasks/4174/20261022_initialize_dataset_vector_indexes';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  counted: vi.fn(),
  removeLegacy: vi.fn(),
  provider: 'pg'
}));
vi.mock('@/migration/tasks/4174/20261022_initialize_dataset_vector_indexes/service', () => ({
  removeLegacyPgVectorIndex: mocks.removeLegacy
}));
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
  mocks.removeLegacy.mockReset().mockResolvedValue(undefined);
});

describe('initializeDatasetVectorIndexes', () => {
  it('scans a fixed snapshot in batches, refreshes counts and only records delivered batches', async () => {
    await seed(1);
    await seed(2);
    await seed(3, { type: DatasetTypeEnum.folder });
    await seed(4, { deleteTime: new Date() });
    mocks.count.mockResolvedValueOnce(10000).mockResolvedValueOnce(10001);
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
    expect(mocks.counted.mock.calls).toEqual([
      [{ teamId, datasetId: id(1), rows: 10000 }],
      [{ teamId, datasetId: id(2), rows: 10001 }]
    ]);
    expect(mocks.removeLegacy.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.counted.mock.invocationCallOrder.at(-1)!
    );
    expect(mocks.removeLegacy.mock.invocationCallOrder[0]).toBeGreaterThan(
      context.saveCheckpoint.mock.invocationCallOrder.at(-1)!
    );
    expect(context.reportProgress.mock.calls).toEqual([
      [{ key: 'datasets', status: 'running' }],
      [{ key: 'datasets', status: 'running', current: 2 }],
      [{ key: 'datasets', status: 'succeeded' }],
      [{ key: 'legacyIndex', status: 'running' }],
      [{ key: 'legacyIndex', status: 'succeeded' }]
    ]);
    expect(checkpoint()).toMatchObject({ lastId: id(2), endId: id(2) });
    expect(await initializeDatasetVectorIndexes(context)).toEqual({
      scannedCount: 2,
      eligibleCount: 1
    });
    expect(mocks.count).toHaveBeenCalledTimes(2);
  });

  it('retries failed legacy index cleanup without recounting or enqueueing completed batches', async () => {
    await seed(1);
    mocks.removeLegacy.mockRejectedValueOnce(new Error('DROP failed'));
    const { context, checkpoint } = createContext();
    await expect(initializeDatasetVectorIndexes(context)).rejects.toThrow('DROP failed');
    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(mocks.counted).toHaveBeenCalledTimes(1);
    expect(checkpoint()).toMatchObject({ lastId: id(1), scannedCount: 1 });
    expect(context.reportProgress.mock.calls.slice(-2)).toEqual([
      [{ key: 'datasets', status: 'succeeded' }],
      [{ key: 'legacyIndex', status: 'running' }]
    ]);
    expect(await initializeDatasetVectorIndexes(context)).toEqual({
      scannedCount: 1,
      eligibleCount: 1
    });
    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(mocks.counted).toHaveBeenCalledTimes(1);
    expect(mocks.removeLegacy).toHaveBeenCalledTimes(2);
  });

  it('does not report cleanup completion if the lease is lost during legacy index cleanup', async () => {
    await seed(1);
    const { context, checkpoint } = createContext();
    mocks.removeLegacy.mockImplementationOnce(async () => {
      context.assertActive.mockRejectedValue(new Error('lease lost'));
    });
    await expect(initializeDatasetVectorIndexes(context)).rejects.toThrow('lease lost');
    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(checkpoint()).toMatchObject({ lastId: id(1), scannedCount: 1 });
    expect(context.reportProgress).not.toHaveBeenCalledWith({
      key: 'legacyIndex',
      status: 'succeeded'
    });
  });

  it.each(['count', 'counted'] as const)(
    'retains the legacy index after failed %s and resumes at the first uncommitted batch',
    async (step) => {
      await Promise.all([seed(1), seed(2), seed(3)]);
      mocks[step]
        .mockResolvedValueOnce(40000)
        .mockResolvedValueOnce(40000)
        .mockRejectedValueOnce(new Error('scan failed'));
      const { context, checkpoint } = createContext();
      await expect(initializeDatasetVectorIndexes(context)).rejects.toThrow('scan failed');
      expect(checkpoint()).toMatchObject({ lastId: id(2), scannedCount: 2 });
      expect(mocks.removeLegacy).not.toHaveBeenCalled();
      expect(context.reportProgress).not.toHaveBeenCalledWith({
        key: 'datasets',
        status: 'succeeded'
      });
      expect(await initializeDatasetVectorIndexes(context)).toEqual({
        scannedCount: 3,
        eligibleCount: 3
      });
      expect(mocks.counted.mock.calls.map(([scope]) => scope.datasetId)).toEqual(
        step === 'count' ? [id(1), id(2), id(3)] : [id(1), id(2), id(3), id(3)]
      );
      expect(mocks.removeLegacy).toHaveBeenCalledTimes(1);
    }
  );

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
    expect(mocks.removeLegacy).not.toHaveBeenCalled();
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
    expect(mocks.removeLegacy).not.toHaveBeenCalled();
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
      key: 'legacyIndex',
      status: 'succeeded'
    });
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.removeLegacy).toHaveBeenCalledTimes(pg ? 1 : 0);
  });
});
