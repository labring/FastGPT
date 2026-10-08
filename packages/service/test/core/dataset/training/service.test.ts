import { TRAINING_LEASE_HEARTBEAT_MS } from '@fastgpt/global/core/dataset/training/constant';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { findAndLockTrainingTask } from '@fastgpt/service/core/dataset/training/entity';
import { BLOCKED_LOCK_TIME } from '@fastgpt/service/core/dataset/training/query';
import {
  createTrainingTaskLease,
  TrainingLeaseLostError,
  getDatasetIndexTrainingMode,
  skipDatasetTrainingEnhancement
} from '@fastgpt/service/core/dataset/training/service';

const createContext = async (indexStatus?: DatasetDataIndexStatusEnum) => {
  const context = {
    teamId: new Types.ObjectId().toString(),
    datasetId: new Types.ObjectId().toString(),
    collectionId: new Types.ObjectId().toString(),
    dataId: new Types.ObjectId().toString()
  };
  await MongoDatasetData.create({
    _id: context.dataId,
    ...context,
    tmbId: new Types.ObjectId(),
    q: 'content',
    chunkIndex: 0,
    indexStatus
  });
  return context;
};

describe('getDatasetIndexTrainingMode', () => {
  it.each([
    [DatasetDataIndexStatusEnum.indexing, TrainingModeEnum.index],
    [DatasetDataIndexStatusEnum.indexed, TrainingModeEnum.chunk],
    [DatasetDataIndexStatusEnum.error, TrainingModeEnum.chunk],
    [undefined, TrainingModeEnum.chunk]
  ])('routes data with status %s to %s', async (status, expected) => {
    expect(await getDatasetIndexTrainingMode(await createContext(status))).toBe(expected);
  });

  it('does not route missing, foreign or unassociated data to index', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    expect(await getDatasetIndexTrainingMode({ ...context, dataId: undefined })).toBe(
      TrainingModeEnum.chunk
    );
    expect(
      await getDatasetIndexTrainingMode({ ...context, dataId: new Types.ObjectId().toString() })
    ).toBe(TrainingModeEnum.chunk);
    expect(
      await getDatasetIndexTrainingMode({ ...context, teamId: new Types.ObjectId().toString() })
    ).toBe(TrainingModeEnum.chunk);
  });
});

describe('createTrainingTaskLease', () => {
  it.each([
    TrainingModeEnum.index,
    TrainingModeEnum.chunk,
    TrainingModeEnum.image,
    TrainingModeEnum.imageParse,
    TrainingModeEnum.auto,
    TrainingModeEnum.qa
  ])('only marks data as error for an exhausted index task (%s)', async (mode) => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    const task = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'test',
      mode,
      retryCount: 1,
      lockTime: new Date()
    });
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(new Error('stage failed'));
    } finally {
      await lease.stop();
    }

    const data = await MongoDatasetData.findById(context.dataId).lean();
    const failedTask = await MongoDatasetTraining.findById(task._id).lean();
    expect(failedTask).toMatchObject({ retryCount: 0, errorMsg: 'stage failed' });
    expect(data?.indexStatus).toBe(
      mode === TrainingModeEnum.index
        ? DatasetDataIndexStatusEnum.error
        : DatasetDataIndexStatusEnum.indexing
    );
    expect(data?.indexErrorMsg).toBe(mode === TrainingModeEnum.index ? 'stage failed' : undefined);
  });
});

describe('skipDatasetTrainingEnhancement', () => {
  it.each([TrainingModeEnum.auto, TrainingModeEnum.image, TrainingModeEnum.imageParse] as const)(
    'preserves index and rebuild routes when skipping %s',
    async (mode) => {
      const fresh = await createContext(DatasetDataIndexStatusEnum.indexing);
      const indexed = await createContext(DatasetDataIndexStatusEnum.indexed);
      const [freshTask, rebuildTask, unrelated] = await MongoDatasetTraining.create(
        [fresh, indexed, fresh].map((context, i) => ({
          ...context,
          tmbId: new Types.ObjectId(),
          billId: 'test',
          mode: i === 2 ? TrainingModeEnum.qa : mode,
          retryCount: 0,
          errorMsg: 'enhancement failed',
          lockTime: BLOCKED_LOCK_TIME,
          expireAt: null
        }))
      );
      await skipDatasetTrainingEnhancement(mode);
      const advancedFresh = await MongoDatasetTraining.findById(freshTask._id).lean();
      const advancedRebuild = await MongoDatasetTraining.findById(rebuildTask._id).lean();
      for (const advanced of [advancedFresh, advancedRebuild]) {
        expect(advanced?.retryCount).toBe(3);
        expect(advanced?.lockTime).toEqual(new Date(0));
        expect(advanced?.errorMsg).toBeUndefined();
      }
      expect(advancedFresh?.mode).toBe(TrainingModeEnum.index);
      expect(advancedFresh?.expireAt).toBeInstanceOf(Date);
      expect(advancedRebuild?.mode).toBe(TrainingModeEnum.chunk);
      expect(advancedRebuild?.expireAt).toBeNull();
      expect(await MongoDatasetTraining.findById(unrelated._id).lean()).toMatchObject({
        mode: TrainingModeEnum.qa,
        retryCount: 0,
        errorMsg: 'enhancement failed',
        lockTime: BLOCKED_LOCK_TIME
      });
      expect(
        await findAndLockTrainingTask({
          mode: TrainingModeEnum.index,
          filter: { _id: freshTask._id }
        })
      ).toBeTruthy();
      expect(
        await findAndLockTrainingTask({
          mode: TrainingModeEnum.chunk,
          filter: { _id: rebuildTask._id }
        })
      ).toBeTruthy();
    }
  );
});

describe('createTrainingTaskLease heartbeat lifecycle', () => {
  const makeTask = () => ({
    _id: new Types.ObjectId().toString(),
    teamId: new Types.ObjectId().toString(),
    datasetId: new Types.ObjectId().toString(),
    collectionId: new Types.ObjectId().toString(),
    mode: TrainingModeEnum.index,
    lockTime: new Date(),
    retryCount: 3
  });
  const matched = {
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    const remainingHeartbeats = vi.getTimerCount();
    vi.useRealTimers();
    vi.restoreAllMocks();
    expect(remainingHeartbeats).toBe(0);
  });

  it('starts explicitly and only once, and cannot restart after stop', async () => {
    const update = vi.spyOn(MongoDatasetTraining, 'updateOne').mockResolvedValue(matched);
    const task = makeTask();
    const lease = createTrainingTaskLease(task);
    expect(vi.getTimerCount()).toBe(0);
    try {
      lease.start();
      lease.start();
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      await lease.stop();
    }
    lease.start();
    await lease.renew();
    await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('waits for the in-flight heartbeat before commit and freezes subsequent renewals', async () => {
    const update = vi.spyOn(MongoDatasetTraining, 'updateOne').mockResolvedValue(matched);
    let finishHeartbeat!: (value: typeof matched) => void;
    update.mockImplementationOnce(
      () =>
        new Promise<typeof matched>((resolve) => {
          finishHeartbeat = resolve;
        }) as never
    );
    const write = vi.fn().mockResolvedValue('committed');
    const task = makeTask();
    const lease = createTrainingTaskLease(task);
    try {
      lease.start();
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      const committing = lease.commit(write);
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      expect(update).toHaveBeenCalledTimes(1);
      expect(write).not.toHaveBeenCalled();
      finishHeartbeat(matched);
      await expect(committing).resolves.toBe('committed');
      expect(update).toHaveBeenCalledTimes(2);
      expect(update.mock.calls[1][0]).toMatchObject({ lockTime: task.lockTime });
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      expect(update).toHaveBeenCalledTimes(2);
    } finally {
      finishHeartbeat(matched);
      await lease.stop();
    }
  });

  it('can record failure after a failed commit without restarting the heartbeat', async () => {
    const update = vi.spyOn(MongoDatasetTraining, 'updateOne').mockResolvedValue(matched);
    const task = makeTask();
    const lease = createTrainingTaskLease(task);
    try {
      lease.start();
      await expect(
        lease.commit(async () => {
          throw new Error('write failed');
        })
      ).rejects.toThrow('write failed');
      await lease.fail(new Error('write failed'));
      expect(update).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ retryCount: 2, errorMsg: 'write failed' })
        }),
        expect.anything()
      );
      const writes = update.mock.calls.length;
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      expect(update).toHaveBeenCalledTimes(writes);
    } finally {
      await lease.stop();
    }
  });

  it('does not commit after a heartbeat loses ownership', async () => {
    vi.spyOn(MongoDatasetTraining, 'updateOne').mockResolvedValue({ ...matched, matchedCount: 0 });
    const task = makeTask();
    const lease = createTrainingTaskLease(task);
    const write = vi.fn();
    try {
      lease.start();
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      expect(lease.signal.aborted).toBe(true);
      await expect(lease.commit(write)).rejects.toBeInstanceOf(TrainingLeaseLostError);
      expect(write).not.toHaveBeenCalled();
    } finally {
      await lease.stop();
    }
  });

  it('stop waits for in-flight renewal and prevents further writes', async () => {
    let finishHeartbeat!: (value: typeof matched) => void;
    const update = vi.spyOn(MongoDatasetTraining, 'updateOne').mockImplementationOnce(
      () =>
        new Promise<typeof matched>((resolve) => {
          finishHeartbeat = resolve;
        }) as never
    );
    const task = makeTask();
    const lease = createTrainingTaskLease(task);
    try {
      lease.start();
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      let stopped = false;
      const stopping = lease.stop().then(() => {
        stopped = true;
      });
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      expect(stopped).toBe(false);
      finishHeartbeat(matched);
      await stopping;
      await vi.advanceTimersByTimeAsync(TRAINING_LEASE_HEARTBEAT_MS);
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      finishHeartbeat(matched);
      await lease.stop();
    }
  });
});
