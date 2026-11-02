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
  count: vi.fn(),
  provider: 'pg',
  info: vi.fn(),
  error: vi.fn()
}));
vi.mock('@fastgpt/dal/redis/bullmq/binding', () => ({
  bullMQ: { getQueue: mocks.getQueue, getWorker: mocks.getWorker }
}));
vi.mock('@fastgpt/service/common/vectorDB/pg/datasetIndex', () => ({
  ensurePgDatasetIndex: mocks.ensureIndex
}));
vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({ getVectorCount: mocks.count }));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => mocks.provider
}));
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLogger: () => ({ info: mocks.info, warn: vi.fn(), error: mocks.error })
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
  mocks.add.mockReset().mockResolvedValue({
    id: `${scope.datasetId}-build`
  });
  mocks.setGlobalConcurrency.mockReset().mockResolvedValue(undefined);
  mocks.getWorker.mockReset().mockReturnValue('worker');
  mocks.getQueue
    .mockReset()
    .mockReturnValue({ add: mocks.add, setGlobalConcurrency: mocks.setGlobalConcurrency });
  mocks.ensureIndex.mockReset().mockResolvedValue({ pgIndex: 'ready', created: true });
  mocks.count.mockReset().mockResolvedValue(40000);
  mocks.info.mockClear();
  mocks.error.mockClear();
});

describe('onDatasetVectorCounted', () => {
  it('does not queue ordinary small datasets without an index or with confirmed none state', async () => {
    await createDataset();
    await onDatasetVectorCounted({ ...scope, rows: 19999 });
    expect(mocks.add).not.toHaveBeenCalled();
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData).toBeUndefined();
    await MongoDataset.updateOne(
      { _id: scope.datasetId },
      { $set: { vectorData: { pgIndex: 'none', pgIndexCheckedAt: new Date() } } }
    );
    await onDatasetVectorCounted({ ...scope, rows: 0 });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('queues retirement below 20000 without demoting ready or extending the existing job', async () => {
    const checked = new Date(1000);
    await createDataset({ vectorData: { pgIndex: 'ready', pgIndexCheckedAt: checked } });
    for (const rows of [20000, 30000]) {
      await onDatasetVectorCounted({ ...scope, rows });
    }
    expect(mocks.add).not.toHaveBeenCalled();
    await onDatasetVectorCounted({ ...scope, rows: 19999 });
    await onDatasetVectorCounted({ ...scope, rows: 0 });
    expect(mocks.add.mock.calls).toEqual([
      ['cleanup', scope, { jobId: `${scope.datasetId}-cleanup` }],
      ['cleanup', scope, { jobId: `${scope.datasetId}-cleanup` }]
    ]);
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData).toEqual({
      pgIndex: 'ready',
      pgIndexCheckedAt: checked
    });
    expect(mocks.getQueue.mock.calls[0][1].defaultJobOptions).not.toHaveProperty('delay');
  });

  it('enqueues strictly above 30000 immediately with a fixed dataset ID', async () => {
    await createDataset();
    await onDatasetVectorCounted({ ...scope, rows: 30000 });
    expect(mocks.add).not.toHaveBeenCalled();
    await onDatasetVectorCounted({ ...scope, rows: 30001 });
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith('build', scope, {
      jobId: `${scope.datasetId}-build`
    });
    expect(mocks.getQueue.mock.calls[0][1].defaultJobOptions).toMatchObject({
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true
    });
    expect(mocks.getQueue.mock.calls[0][1].defaultJobOptions).not.toHaveProperty('delay');
    expect(mocks.getQueue.mock.calls[0][1].defaultJobOptions).not.toHaveProperty('backoff');
    const dataset = await MongoDataset.findById(scope.datasetId).lean();
    expect(dataset?.vectorData).toEqual({ pgIndex: 'pending', pgIndexCheckedAt: expect.any(Date) });
    expect(dataset?.vectorData).not.toHaveProperty('rows');
  });

  it.each(['pending', 'building', 'ready'] as const)(
    'does not overwrite %s state on repeat notifications',
    async (pgIndex) => {
      const checked = new Date(1000);
      await createDataset({ vectorData: { pgIndex, pgIndexCheckedAt: checked } });
      await onDatasetVectorCounted({ ...scope, rows: 50000 });
      await onDatasetVectorCounted({ ...scope, rows: 60000 });
      expect(mocks.add.mock.calls.map((call) => call[2])).toEqual([
        { jobId: `${scope.datasetId}-build` },
        { jobId: `${scope.datasetId}-build` }
      ]);
      expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData).toEqual({
        pgIndex,
        pgIndexCheckedAt: checked
      });
    }
  );

  it.each(['pending', 'building'] as const)(
    'keeps cleanup separate from a %s build and deduplicates repeated low-count notifications',
    async (pgIndex) => {
      await createDataset({ vectorData: { pgIndex, pgIndexCheckedAt: new Date() } });
      await onDatasetVectorCounted({ ...scope, rows: 40000 });
      await onDatasetVectorCounted({ ...scope, rows: 19999 });
      await onDatasetVectorCounted({ ...scope, rows: 0 });
      expect(mocks.add.mock.calls).toEqual([
        ['build', scope, { jobId: `${scope.datasetId}-build` }],
        ['cleanup', scope, { jobId: `${scope.datasetId}-cleanup` }],
        ['cleanup', scope, { jobId: `${scope.datasetId}-cleanup` }]
      ]);
      expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
        pgIndex
      );
    }
  );

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

  it.each([
    ['none', 'ready'],
    ['none', 'removing'],
    ['none', 'failed'],
    ['failed', 'failed']
  ] as const)(
    'preserves the worker outcome after %s -> %s while a notification is still enqueueing',
    async (before, pgIndex) => {
      await createDataset(
        before === 'failed'
          ? { vectorData: { pgIndex: 'failed', pgIndexCheckedAt: new Date(1000) } }
          : {}
      );
      mocks.add.mockImplementationOnce(async () => {
        await MongoDataset.updateOne(
          { _id: scope.datasetId },
          {
            $set: {
              vectorData: { pgIndex, pgIndexCheckedAt: new Date(2000) }
            }
          }
        );
        return { id: `${scope.datasetId}-build` };
      });
      await onDatasetVectorCounted({ ...scope, rows: 40000 });
      expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
        pgIndex
      );
    }
  );

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
  it('rechecks freshly built rows and schedules a separate cleanup even without a deletion notification', async () => {
    await createDataset();
    mocks.count.mockResolvedValueOnce(19999);
    await processDatasetVectorIndex(scope, { operation: 'build' });
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith(scope, {
      refresh: true,
      notifyDatasetCounted: false
    });
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith('cleanup', scope, {
      jobId: `${scope.datasetId}-cleanup`
    });
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'ready'
    );
    mocks.ensureIndex.mockResolvedValueOnce({ pgIndex: 'none', created: false });
    await processDatasetVectorIndex(scope, { operation: 'cleanup' });
    expect(mocks.ensureIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...scope, allowCreate: false })
    );
    expect(mocks.count).toHaveBeenCalledOnce();
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe('none');
  });

  it('keeps the index at exactly 20000 rows after a build', async () => {
    await createDataset();
    mocks.count.mockResolvedValueOnce(20000);
    await processDatasetVectorIndex(scope, { operation: 'build' });
    expect(mocks.add).not.toHaveBeenCalled();
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'ready'
    );
  });

  it.each(['count', 'cleanup-delivery'] as const)(
    'retains failed state when the post-build %s cannot complete',
    async (step) => {
      await createDataset();
      if (step === 'count') mocks.count.mockRejectedValueOnce(new Error('post-build failed'));
      else {
        mocks.count.mockResolvedValueOnce(19999);
        mocks.add.mockRejectedValueOnce(new Error('post-build failed'));
      }
      await expect(processDatasetVectorIndex(scope, { operation: 'build' })).rejects.toThrow(
        'post-build failed'
      );
      expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
        'failed'
      );
    }
  );

  it.each(['soft-deleted', 'removed'])(
    'denies a build if the dataset was %s after the worker claimed its job',
    async (state) => {
      await createDataset();
      mocks.ensureIndex.mockImplementation(async ({ onBuilding }) => {
        if (state === 'soft-deleted') {
          await MongoDataset.updateOne(
            { _id: scope.datasetId },
            { $set: { deleteTime: new Date() } }
          );
        } else {
          await MongoDataset.deleteOne({ _id: scope.datasetId });
        }
        expect(await onBuilding()).toBe(false);
        return { pgIndex: 'none', created: false };
      });
      await processDatasetVectorIndex(scope, { operation: 'build' });
      expect(mocks.ensureIndex).toHaveBeenCalledOnce();
      expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData).toBeUndefined();
    }
  );

  it('publishes removing before DROP and none only after removal succeeds', async () => {
    await createDataset({ vectorData: { pgIndex: 'ready', pgIndexCheckedAt: new Date() } });
    mocks.ensureIndex.mockImplementation(async ({ onRemoving }) => {
      await onRemoving();
      expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
        'removing'
      );
      return { pgIndex: 'none', created: false };
    });
    await processDatasetVectorIndex(scope, { operation: 'cleanup' });
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData).toEqual({
      pgIndex: 'none',
      pgIndexCheckedAt: expect.any(Date)
    });
  });

  it('records DROP failures and allows the next low count to enqueue a successful retry', async () => {
    await createDataset({ vectorData: { pgIndex: 'ready', pgIndexCheckedAt: new Date() } });
    mocks.ensureIndex.mockImplementationOnce(async ({ onRemoving }) => {
      await onRemoving();
      throw new Error('DROP connection lost');
    });
    await expect(processDatasetVectorIndex(scope, { operation: 'cleanup' })).rejects.toThrow(
      'DROP connection lost'
    );
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'failed'
    );
    await onDatasetVectorCounted({ ...scope, rows: 0 });
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith('cleanup', scope, {
      jobId: `${scope.datasetId}-cleanup`
    });
    mocks.ensureIndex.mockResolvedValueOnce({ pgIndex: 'none', created: false });
    await processDatasetVectorIndex(scope, { operation: 'cleanup' });
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe('none');
  });

  it('publishes building and real phase progress, then ready only after catalog verification', async () => {
    await createDataset();
    mocks.ensureIndex.mockImplementation(async ({ onBuilding, onProgress }) => {
      expect(await onBuilding()).toBe(true);
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
    await processDatasetVectorIndex(scope, { operation: 'build' });
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
    await processDatasetVectorIndex(scope, { operation: 'build' });
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      pgIndex
    );
  });

  it('keeps failed after a build error until a new count schedules another attempt', async () => {
    await createDataset();
    await onDatasetVectorCounted({ ...scope, rows: 40000 });
    const error = Object.assign(
      new Error('could not resize shared memory segment: No space left on device'),
      { code: '53100' }
    );
    mocks.ensureIndex.mockRejectedValueOnce(error);
    await expect(processDatasetVectorIndex(scope, { operation: 'build' })).rejects.toThrow(
      'shared memory'
    );
    expect(mocks.error).toHaveBeenCalledWith(
      'PG dataset FP16 index task failed',
      expect.objectContaining({ ...scope, error })
    );
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'failed'
    );
    expect(mocks.add).toHaveBeenCalledOnce();
    await onDatasetVectorCounted({ ...scope, rows: 40000 });
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.add).toHaveBeenLastCalledWith('build', scope, {
      jobId: `${scope.datasetId}-build`
    });
    expect((await MongoDataset.findById(scope.datasetId).lean())?.vectorData?.pgIndex).toBe(
      'pending'
    );
    await processDatasetVectorIndex(scope, { operation: 'build' });
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
      await expect(processDatasetVectorIndex(scope, { operation: 'build' })).rejects.toThrow(
        'PG offline'
      );
    } finally {
      update.mockRestore();
    }
  });

  it('skips jobs for already deleted datasets', async () => {
    await processDatasetVectorIndex(scope, { operation: 'build' });
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
    await createDataset();
    for (const name of ['build', 'cleanup']) {
      await mocks.getWorker.mock.calls[0][1]({ data: scope, name });
    }
    expect(mocks.ensureIndex.mock.calls.map(([props]) => props.allowCreate)).toEqual([true, false]);
    expect(() => mocks.getWorker.mock.calls[0][1]({ data: scope, name: 'unknown' })).toThrow(
      'Unknown PG dataset index task'
    );
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
