import {
  TRAINING_LEASE_TIMEOUT_MS,
  TRAINING_LEASE_HEARTBEAT_MS
} from '@fastgpt/global/core/dataset/training/constant';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  EmbeddingRequestError,
  normalizeEmbeddingError
} from '@fastgpt/service/core/ai/embedding/error';
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
    [DatasetDataIndexStatusEnum.indexed, TrainingModeEnum.rebuildIndex],
    [DatasetDataIndexStatusEnum.error, TrainingModeEnum.index],
    [undefined, TrainingModeEnum.rebuildIndex]
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
    ).toBe(TrainingModeEnum.rebuildIndex);
    expect(
      await getDatasetIndexTrainingMode({ ...context, teamId: new Types.ObjectId().toString() })
    ).toBe(TrainingModeEnum.rebuildIndex);
  });
});

describe('createTrainingTaskLease', () => {
  it.each([
    TrainingModeEnum.index,
    TrainingModeEnum.rebuildIndex,
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

  it.each([
    {
      name: 'non-retryable EmbeddingRequestError',
      error: new EmbeddingRequestError(ModelErrEnum.authFailed, {
        category: 'authFailed',
        retryable: false,
        errorCode: ModelErrEnum.authFailed
      }),
      expectedMsg: 'common:code_error.model_error.auth_failed'
    },
    {
      name: 'permanent imageDownloadFailed EmbeddingRequestError',
      error: new EmbeddingRequestError(ModelErrEnum.imageDownloadFailed, {
        category: 'imageDownloadFailed',
        retryable: false,
        errorCode: ModelErrEnum.imageDownloadFailed
      }),
      expectedMsg: 'common:code_error.model_error.image_download_failed'
    },
    {
      name: 'model config error (unExist)',
      error: new UserError(ModelErrEnum.unExist),
      expectedMsg: 'common:model_delisted'
    },
    {
      name: 'no available channel code',
      error: ModelErrEnum.noAvailableChannel,
      expectedMsg: 'common:code_error.model_error.no_available_channel'
    }
  ])(
    'terminates retries immediately and records friendly error for $name',
    async ({ error, expectedMsg }) => {
      const context = await createContext(DatasetDataIndexStatusEnum.indexing);
      const task = await MongoDatasetTraining.create({
        ...context,
        tmbId: new Types.ObjectId(),
        billId: 'test',
        mode: TrainingModeEnum.index,
        retryCount: 3,
        lockTime: new Date()
      });
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(error);
      } finally {
        await lease.stop();
      }

      const failedTask = await MongoDatasetTraining.findById(task._id).lean();
      const data = await MongoDatasetData.findById(context.dataId).lean();
      expect(failedTask).toMatchObject({
        retryCount: 0,
        expireAt: null,
        errorMsg: expectedMsg
      });
      expect(data).toMatchObject({
        indexStatus: DatasetDataIndexStatusEnum.error,
        indexErrorMsg: expectedMsg
      });
    }
  );

  it.each([
    {
      name: 'rateLimited EmbeddingRequestError',
      error: new EmbeddingRequestError(ModelErrEnum.rateLimited, {
        category: 'rateLimited',
        retryable: true,
        errorCode: ModelErrEnum.rateLimited
      }),
      expectedMsg: 'common:code_error.model_error.rate_limited'
    },
    {
      name: 'HTTP 400 wrapped service_unavailable upstream error',
      error: normalizeEmbeddingError(
        Object.assign(new Error('400 upstream temporarily unavailable'), {
          status: 400,
          code: 'service_unavailable',
          type: 'upstream_error'
        })
      ),
      expectedMsg: 'common:code_error.model_error.service_unavailable'
    }
  ])(
    'keeps queue retries for $name while storing friendly message',
    async ({ error, expectedMsg }) => {
      const context = await createContext(DatasetDataIndexStatusEnum.indexing);
      const task = await MongoDatasetTraining.create({
        ...context,
        tmbId: new Types.ObjectId(),
        billId: 'test',
        mode: TrainingModeEnum.index,
        retryCount: 3,
        lockTime: new Date()
      });
      const lease = createTrainingTaskLease(task);
      try {
        await lease.fail(error);
      } finally {
        await lease.stop();
      }

      const pendingRetryTask = await MongoDatasetTraining.findById(task._id).lean();
      const data = await MongoDatasetData.findById(context.dataId).lean();
      expect(pendingRetryTask).toMatchObject({
        retryCount: 2,
        errorMsg: expectedMsg
      });
      expect(pendingRetryTask?.expireAt).toBeInstanceOf(Date);
      expect(data?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
      expect(data?.indexErrorMsg).toBeUndefined();
    }
  );

  it('honors upstream retryAfterMs beyond 60s when scheduling next queue claim and extends expireAt', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    const task = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'test',
      mode: TrainingModeEnum.index,
      retryCount: 3,
      lockTime: new Date()
    });
    const longRateLimitErr = new EmbeddingRequestError(ModelErrEnum.rateLimited, {
      category: 'rateLimited',
      retryable: true,
      retryAfterMs: 180_000,
      errorCode: ModelErrEnum.rateLimited
    });
    const beforeFail = Date.now();
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(longRateLimitErr);
    } finally {
      await lease.stop();
    }

    const rescheduled = await MongoDatasetTraining.findById(task._id).lean();
    expect(rescheduled?.retryCount).toBe(2);
    const nextClaimableAt = rescheduled!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS;
    expect(nextClaimableAt - beforeFail).toBeGreaterThanOrEqual(179_000);
    expect(nextClaimableAt - beforeFail).toBeLessThanOrEqual(185_000);
    expect(rescheduled!.expireAt!.getTime() - beforeFail).toBeGreaterThanOrEqual(179_000);

    // 未到 180 秒窗口前不应被提前领取。
    const claimedTooEarly = await findAndLockTrainingTask({
      mode: TrainingModeEnum.index,
      filter: { _id: task._id }
    });
    expect(claimedTooEarly).toBeNull();
  });

  it('preserves expireAt: null and missing expireAt when scheduling long retryAfterMs delays', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.rebuildSynonymRunning);
    const nullExpireTask = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'test',
      mode: TrainingModeEnum.rebuildSynonym,
      retryCount: 3,
      expireAt: null,
      lockTime: new Date()
    });
    const missingExpireTask = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'test',
      mode: TrainingModeEnum.rebuildSynonym,
      retryCount: 3,
      expireAt: null,
      lockTime: new Date()
    });
    await MongoDatasetTraining.updateOne(
      { _id: missingExpireTask._id },
      { $unset: { expireAt: 1 } }
    );
    const loadedMissingTask = (await MongoDatasetTraining.findById(missingExpireTask._id).lean())!;

    const longRetryErr = new EmbeddingRequestError(ModelErrEnum.serviceUnavailable, {
      category: 'upstreamUnavailable',
      retryable: true,
      retryAfterMs: 180_000,
      errorCode: ModelErrEnum.serviceUnavailable
    });
    const beforeFail = Date.now();

    for (const candidate of [nullExpireTask, loadedMissingTask]) {
      const lease = createTrainingTaskLease(candidate);
      try {
        await lease.fail(longRetryErr);
      } finally {
        await lease.stop();
      }
    }

    const savedNull = await MongoDatasetTraining.findById(nullExpireTask._id).lean();
    const savedMissing = await MongoDatasetTraining.findById(missingExpireTask._id).lean();
    expect(savedNull?.retryCount).toBe(2);
    expect(savedNull?.expireAt).toBeNull();
    expect(
      savedNull!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS - beforeFail
    ).toBeGreaterThanOrEqual(179_000);
    expect(savedMissing?.retryCount).toBe(2);
    expect(savedMissing?.expireAt).toBeUndefined();
    expect(
      savedMissing!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS - beforeFail
    ).toBeGreaterThanOrEqual(179_000);
  });

  it('caps extreme upstream retryAfterMs to 24h so lockTime stays active below BLOCKED_LOCK_TIME', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    const task = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'test',
      mode: TrainingModeEnum.index,
      retryCount: 3,
      lockTime: new Date()
    });
    const extremeErr = new EmbeddingRequestError(ModelErrEnum.rateLimited, {
      category: 'rateLimited',
      retryable: true,
      retryAfterMs: 10 * 24 * 60 * 60 * 1000,
      errorCode: ModelErrEnum.rateLimited
    });
    const beforeFail = Date.now();
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(extremeErr);
    } finally {
      await lease.stop();
    }

    const rescheduled = await MongoDatasetTraining.findById(task._id).lean();
    const maxDelayMs = 24 * 60 * 60 * 1000;
    const nextClaimableAt = rescheduled!.lockTime.getTime() + TRAINING_LEASE_TIMEOUT_MS;
    expect(rescheduled!.lockTime.getTime()).toBeLessThan(BLOCKED_LOCK_TIME.getTime());
    expect(nextClaimableAt - beforeFail).toBeGreaterThanOrEqual(maxDelayMs - 2000);
    expect(nextClaimableAt - beforeFail).toBeLessThanOrEqual(maxDelayMs + 5000);
  });

  it('respects explicit terminal=false override even on non-retryable model errors', async () => {
    const context = await createContext(DatasetDataIndexStatusEnum.indexing);
    const task = await MongoDatasetTraining.create({
      ...context,
      tmbId: new Types.ObjectId(),
      billId: 'test',
      mode: TrainingModeEnum.index,
      retryCount: 3,
      lockTime: new Date()
    });
    const lease = createTrainingTaskLease(task);
    try {
      await lease.fail(new UserError(ModelErrEnum.unExist), { terminal: false });
    } finally {
      await lease.stop();
    }

    const taskAfterFail = await MongoDatasetTraining.findById(task._id).lean();
    expect(taskAfterFail?.retryCount).toBe(2);
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
      expect(advancedRebuild?.mode).toBe(TrainingModeEnum.rebuildIndex);
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
          mode: TrainingModeEnum.rebuildIndex,
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
    const updateData = MongoDatasetData.bulkWrite.bind(MongoDatasetData);
    const update = vi.spyOn(MongoDatasetData, 'bulkWrite');
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
  it.each([
    {
      mode: TrainingModeEnum.rebuildIndex,
      running: DatasetDataIndexStatusEnum.rebuildIndexRunning,
      failed: DatasetDataIndexStatusEnum.rebuildIndexFailed
    },
    {
      mode: TrainingModeEnum.rebuildSynonym,
      running: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
      failed: DatasetDataIndexStatusEnum.rebuildSynonymFailed
    }
  ])(
    'keeps automatic retries running and restores the matching $mode state',
    async ({ mode, running, failed }) => {
      const context = await createContext(running);
      const task = await MongoDatasetTraining.create({
        ...context,
        tmbId: new Types.ObjectId(),
        billId: 'rebuild-status',
        mode,
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
        indexStatus: running
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
        indexStatus: failed,
        indexErrorMsg: 'exhausted'
      });
      await retryFailedTrainingTasks({ teamId: context.teamId, datasetId: context.datasetId });
      const data = await MongoDatasetData.findById(context.dataId).lean();
      expect(data?.indexStatus).toBe(running);
      expect(data?.indexErrorMsg).toBeUndefined();
      expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
        retryCount: 3,
        mode
      });
    }
  );
});
