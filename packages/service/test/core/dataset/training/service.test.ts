import {
  TRAINING_LEASE_TIMEOUT_MS,
  TRAINING_LEASE_HEARTBEAT_MS
} from '@fastgpt/global/core/dataset/training/constant';
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
  skipDatasetTrainingEnhancement,
  retryFailedTrainingTasks
} from '@fastgpt/service/core/dataset/training/service';

// 租约提交必须验证真实事务回滚，不能使用全局的无事务 mock。
vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

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
    [DatasetDataIndexStatusEnum.indexed, TrainingModeEnum.rebuild],
    [DatasetDataIndexStatusEnum.error, TrainingModeEnum.index],
    [undefined, TrainingModeEnum.rebuild]
  ])('routes data with status %s to %s', async (status, expected) => {
    expect(await getDatasetIndexTrainingMode(await createContext(status))).toBe(expected);
  });

  it('does not route missing, foreign or unassociated data to index', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    await expect(getDatasetIndexTrainingMode({ ...context, dataId: undefined })).rejects.toThrow(
      'dataId is missing'
    );
    expect(
      await getDatasetIndexTrainingMode({ ...context, dataId: new Types.ObjectId().toString() })
    ).toBe(TrainingModeEnum.rebuild);
    expect(
      await getDatasetIndexTrainingMode({ ...context, teamId: new Types.ObjectId().toString() })
    ).toBe(TrainingModeEnum.rebuild);
  });
});

describe('createTrainingTaskLease', () => {
  it.each([
    TrainingModeEnum.index,
    TrainingModeEnum.rebuild,
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
      expect(advancedRebuild?.mode).toBe(TrainingModeEnum.rebuild);
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
          mode: TrainingModeEnum.rebuild,
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

describe('training lease transactional ownership', () => {
  const createTask = async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    const task = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'transaction-test',
      mode: TrainingModeEnum.index,
      retryCount: 3,
      lockTime: new Date(Date.now() - 1000)
    });
    return { context, task };
  };

  it('rolls back data and task writes when completion fails after the business write', async () => {
    const { context, task } = await createTask();
    const lease = createTrainingTaskLease(task);
    try {
      await expect(
        lease.complete(async (session) => {
          await MongoDatasetData.updateOne(
            { _id: context.dataId },
            {
              $set: { q: 'uncommitted content', indexStatus: DatasetDataIndexStatusEnum.indexed }
            },
            { session }
          );
          // 模拟业务回调意外改变阶段：最终删除必须失败，并撤销同一事务的全部写入。
          await MongoDatasetTraining.updateOne(
            { _id: task._id },
            {
              $set: { mode: TrainingModeEnum.auto }
            },
            { session }
          );
        })
      ).rejects.toBeInstanceOf(TrainingLeaseLostError);
      expect(await MongoDatasetData.findById(context.dataId).lean()).toMatchObject({
        q: 'content',
        indexStatus: DatasetDataIndexStatusEnum.indexing
      });
      expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
        mode: TrainingModeEnum.index,
        retryCount: 3
      });
    } finally {
      await lease.stop();
    }
  });

  it('rejects an old worker after another worker claims the task', async () => {
    const { context, task } = await createTask();
    const oldLease = createTrainingTaskLease(task);
    await MongoDatasetTraining.updateOne(
      { _id: task._id },
      {
        $set: { lockTime: new Date(Date.now() - TRAINING_LEASE_TIMEOUT_MS - 1) }
      }
    );
    const claimed = await findAndLockTrainingTask({
      mode: TrainingModeEnum.index,
      filter: { _id: task._id }
    });
    if (!claimed) throw new Error('Expected replacement worker to claim task');
    const newLease = createTrainingTaskLease(claimed);
    const staleWrite = vi.fn();
    try {
      await expect(oldLease.complete(staleWrite)).rejects.toBeInstanceOf(TrainingLeaseLostError);
      expect(staleWrite).not.toHaveBeenCalled();
      await oldLease.fail(new Error('stale worker failure'));
      expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({ retryCount: 3 });
      await newLease.complete(async (session) => {
        await MongoDatasetData.updateOne(
          { _id: context.dataId },
          {
            $set: { indexStatus: DatasetDataIndexStatusEnum.indexed }
          },
          { session }
        );
      });
      expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
      expect((await MongoDatasetData.findById(context.dataId).lean())?.indexStatus).toBe(
        DatasetDataIndexStatusEnum.indexed
      );
    } finally {
      await oldLease.stop();
      await newLease.stop();
    }
  });
});

describe('retryFailedTrainingTasks', () => {
  it('commits bounded batches, rolls back a failed batch and can resume safely', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    const scope = {
      teamId: context.teamId,
      datasetId: context.datasetId,
      collectionId: context.collectionId
    };
    const data = await MongoDatasetData.insertMany(
      Array.from({ length: 501 }, () => ({
        ...scope,
        tmbId: new Types.ObjectId(),
        q: 'failed data',
        indexStatus: DatasetDataIndexStatusEnum.error,
        indexErrorMsg: 'failed'
      }))
    );
    await MongoDatasetTraining.insertMany(
      data.map((item) => ({
        ...scope,
        tmbId: new Types.ObjectId(),
        dataId: item._id,
        billId: 'retry-batch',
        mode: TrainingModeEnum.index,
        retryCount: 0,
        errorMsg: 'failed',
        lockTime: BLOCKED_LOCK_TIME,
        expireAt: null
      }))
    );
    const updateData = MongoDatasetData.updateMany.bind(MongoDatasetData);
    const update = vi.spyOn(MongoDatasetData, 'updateMany');
    update.mockImplementationOnce((...args) => updateData(...args));
    update.mockRejectedValueOnce(new Error('second batch failed'));
    try {
      await expect(retryFailedTrainingTasks(scope)).rejects.toThrow('second batch failed');
    } finally {
      update.mockRestore();
    }
    expect(await MongoDatasetTraining.countDocuments({ ...scope, retryCount: 3 })).toBe(500);
    expect(await MongoDatasetTraining.countDocuments({ ...scope, retryCount: 0 })).toBe(1);
    expect(
      await MongoDatasetData.countDocuments({
        ...scope,
        indexStatus: DatasetDataIndexStatusEnum.error
      })
    ).toBe(1);
    await retryFailedTrainingTasks(scope);
    await retryFailedTrainingTasks(scope);
    expect(
      await MongoDatasetTraining.countDocuments({
        ...scope,
        retryCount: 3,
        lockTime: new Date(0),
        errorMsg: { $exists: false },
        expireAt: null
      })
    ).toBe(501);
    expect(
      await MongoDatasetData.countDocuments({
        ...scope,
        indexStatus: DatasetDataIndexStatusEnum.error
      })
    ).toBe(0);
  });
});

describe('rebuild status failure and retry', () => {
  it('keeps automatic retries rebuilding and moves terminal failures to rebuildError', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.rebuilding);
    const task = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'rebuild-status',
      mode: TrainingModeEnum.rebuild,
      retryCount: 2,
      lockTime: new Date()
    });
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(new Error('temporary'));
    } finally {
      await lease.stop();
    }
    expect(await MongoDatasetData.findById(context.dataId).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.rebuilding
    });
    const retryTask = await MongoDatasetTraining.findById(task._id);
    if (!retryTask) throw new Error('Expected retry task');
    const retryLease = createTrainingTaskLease(retryTask);
    try {
      await retryLease.fail(new Error('exhausted'));
    } finally {
      await retryLease.stop();
    }
    expect(await MongoDatasetData.findById(context.dataId).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.rebuildError,
      indexErrorMsg: 'exhausted'
    });
    await retryFailedTrainingTasks({ teamId: context.teamId, datasetId: context.datasetId });
    const data = await MongoDatasetData.findById(context.dataId).lean();
    expect(data?.indexStatus).toBe(DatasetDataIndexStatusEnum.rebuilding);
    expect(data?.indexErrorMsg).toBeUndefined();
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      retryCount: 3,
      mode: TrainingModeEnum.rebuild
    });
  });
});
