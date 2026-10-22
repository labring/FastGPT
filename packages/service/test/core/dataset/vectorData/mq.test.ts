import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  setGlobalConcurrency: vi.fn(),
  getWorker: vi.fn(),
  getQueue: vi.fn(),
  ensureIndex: vi.fn(),
  provider: 'pg',
  info: vi.fn()
}));
vi.mock('@fastgpt/dal/redis/bullmq/binding', () => ({
  bullMQ: { getQueue: mocks.getQueue, getWorker: mocks.getWorker }
}));
vi.mock('@fastgpt/service/common/vectorDB/pg/datasetIndex', () => ({
  ensurePgDatasetIndex: mocks.ensureIndex
}));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => mocks.provider
}));
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLogger: () => ({ info: mocks.info, warn: vi.fn(), error: vi.fn() })
}));

import {
  onDatasetVectorCounted,
  processDatasetVectorIndex,
  initDatasetVectorIndexWorker
} from '@fastgpt/service/core/dataset/vectorData/mq';

const scope = {
  teamId: '507f1f77bcf86cd799439011',
  datasetId: '507f1f77bcf86cd799439012'
};
const createDataset = (extra: Record<string, unknown> = {}) =>
  MongoDataset.create({
    _id: scope.datasetId,
    teamId: scope.teamId,
    tmbId: new Types.ObjectId(),
    name: 'vectors',
    type: DatasetTypeEnum.dataset,
    ...extra
  });

beforeEach(() => {
  mocks.provider = 'pg';
  mocks.add.mockReset().mockResolvedValue({ id: scope.datasetId });
  mocks.setGlobalConcurrency.mockReset().mockResolvedValue(undefined);
  mocks.getWorker.mockReset().mockReturnValue('worker');
  mocks.getQueue
    .mockReset()
    .mockReturnValue({ add: mocks.add, setGlobalConcurrency: mocks.setGlobalConcurrency });
  mocks.ensureIndex.mockReset().mockResolvedValue({ pgIndex: 'ready', created: true });
  mocks.info.mockClear();
});

describe('onDatasetVectorCounted', () => {
  it('enqueues strictly above 30000 with a fixed dataset ID and 10 minute delay', async () => {
    await createDataset();
    await onDatasetVectorCounted({ ...scope, rows: 30000 });
    expect(mocks.add).not.toHaveBeenCalled();
    await onDatasetVectorCounted({ ...scope, rows: 30001 });
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith('build', scope, { jobId: scope.datasetId });
    expect(mocks.getQueue.mock.calls[0][1].defaultJobOptions).toMatchObject({
      delay: 600000,
      removeOnComplete: true
    });
    const dataset = await MongoDataset.findById(scope.datasetId).lean();
    expect(dataset?.vectorData).toEqual({ pgIndex: 'pending', pgIndexCheckedAt: expect.any(Date) });
    expect(dataset?.vectorData).not.toHaveProperty('rows');
  });

  it.each(['pending', 'building'] as const)(
    'does not overwrite %s state on repeat notifications',
    async (pgIndex) => {
      const checked = new Date(1000);
      await createDataset({ vectorData: { pgIndex, pgIndexCheckedAt: checked } });
      await onDatasetVectorCounted({ ...scope, rows: 50000 });
      await onDatasetVectorCounted({ ...scope, rows: 60000 });
      expect(mocks.add.mock.calls.map((call) => call[2])).toEqual([
        { jobId: scope.datasetId },
        { jobId: scope.datasetId }
      ]);
      expect(
        (await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndexCheckedAt
      ).toEqual(checked);
    }
  );

  it('queues ready datasets for catalog checks without demoting them', async () => {
    await createDataset({ vectorData: { pgIndex: 'ready', pgIndexCheckedAt: new Date() } });
    await onDatasetVectorCounted({ ...scope, rows: 50000 });
    expect(mocks.add).toHaveBeenCalledOnce();
    await onDatasetVectorCounted({ ...scope, rows: 50000 });
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'ready'
    );
  });

  it('never persists pending if queue delivery fails; the next count can retry', async () => {
    await createDataset();
    mocks.add.mockRejectedValueOnce(new Error('redis down'));
    await expect(onDatasetVectorCounted({ ...scope, rows: 40000 })).rejects.toThrow('redis down');
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData).toBeUndefined();
    await onDatasetVectorCounted({ ...scope, rows: 40000 });
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'pending'
    );
  });

  it('does not overwrite ready when an older count notification finishes after the worker', async () => {
    await createDataset();
    mocks.add.mockImplementationOnce(async () => {
      await MongoDataset.updateOne(
        { _id: scope.datasetId },
        {
          $set: {
            vectorData: { pgIndex: 'ready', pgIndexCheckedAt: new Date() }
          }
        }
      );
    });
    await onDatasetVectorCounted({ ...scope, rows: 40000 });
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'ready'
    );
  });

  it('skips other providers, wrong teams and deleted or absent datasets', async () => {
    await onDatasetVectorCounted({ ...scope, rows: 40000 });
    await createDataset({ deleteTime: new Date() });
    await onDatasetVectorCounted({ ...scope, rows: 40000 });
    await MongoDataset.updateOne({ _id: scope.datasetId }, { $set: { deleteTime: null } });
    await onDatasetVectorCounted({ ...scope, teamId: '507f1f77bcf86cd799439099', rows: 40000 });
    mocks.provider = 'milvus';
    await onDatasetVectorCounted({ ...scope, rows: 40000 });
    expect(mocks.add).not.toHaveBeenCalled();
  });
});

describe('processDatasetVectorIndex', () => {
  it('publishes building and real phase progress, then ready only after catalog verification', async () => {
    await createDataset();
    mocks.ensureIndex.mockImplementation(async ({ onBuilding, onProgress }) => {
      await onBuilding();
      expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
        'building'
      );
      onProgress({
        phase: 'building index: loading tuples',
        blocksDone: 1,
        blocksTotal: 2,
        tuplesDone: 2,
        tuplesTotal: 0
      });
      onProgress({
        phase: 'waiting for old snapshots',
        blocksDone: 0,
        blocksTotal: 0,
        tuplesDone: 0,
        tuplesTotal: 0
      });
      return { pgIndex: 'ready', created: true };
    });
    await processDatasetVectorIndex(scope);
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'ready'
    );
    expect(mocks.info).toHaveBeenCalledWith(
      'PG dataset FP16 index build progress',
      expect.objectContaining({ phasePercent: 50 })
    );
    expect(mocks.info).toHaveBeenCalledWith(
      'PG dataset FP16 index build progress',
      expect.objectContaining({ phasePercent: undefined })
    );
  });

  it.each(['ready', 'none'] as const)('synchronizes a skipped build as %s', async (pgIndex) => {
    await createDataset();
    mocks.ensureIndex.mockResolvedValue({ pgIndex, created: false });
    await processDatasetVectorIndex(scope);
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      pgIndex
    );
  });

  it('sets failed on build errors and allows the queue retry to synchronize ready', async () => {
    await createDataset();
    mocks.ensureIndex.mockRejectedValueOnce(new Error('PG down'));
    await expect(processDatasetVectorIndex(scope)).rejects.toThrow('PG down');
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'failed'
    );
    await processDatasetVectorIndex(scope);
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'ready'
    );
  });

  it('preserves the build error when recording failed status is also unavailable', async () => {
    await createDataset();
    mocks.ensureIndex.mockRejectedValueOnce(new Error('PG offline'));
    const update = vi
      .spyOn(MongoDataset, 'updateOne')
      .mockRejectedValueOnce(new Error('Mongo offline'));
    try {
      await expect(processDatasetVectorIndex(scope)).rejects.toThrow('PG offline');
    } finally {
      update.mockRestore();
    }
  });

  it('skips jobs for already deleted datasets', async () => {
    await processDatasetVectorIndex(scope);
    expect(mocks.ensureIndex).not.toHaveBeenCalled();
  });
});

describe('initDatasetVectorIndexWorker', () => {
  it('sets global concurrency before creating the local worker', async () => {
    expect(await initDatasetVectorIndexWorker()).toBe('worker');
    expect(mocks.setGlobalConcurrency).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.getWorker.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.setGlobalConcurrency.mock.invocationCallOrder[0]
    );
    expect(mocks.getWorker.mock.calls[0][2]).toEqual({ concurrency: 1 });
    await mocks.getWorker.mock.calls[0][1]({ data: scope });
  });

  it('starts no worker when global concurrency could not be set or for non-PG providers', async () => {
    mocks.setGlobalConcurrency.mockRejectedValueOnce(new Error('offline'));
    await expect(initDatasetVectorIndexWorker()).rejects.toThrow('offline');
    expect(mocks.getWorker).not.toHaveBeenCalled();
    mocks.provider = 'milvus';
    await initDatasetVectorIndexWorker();
    expect(mocks.getWorker).not.toHaveBeenCalled();
  });
});
