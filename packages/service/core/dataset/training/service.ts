import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetTraining } from './schema';
import { findAndLockTrainingTask, type FindAndLockTrainingTaskOptions } from './entity';
import type { ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  TRAINING_LEASE_TIMEOUT_MS,
  TRAINING_LEASE_HEARTBEAT_MS
} from '@fastgpt/global/core/dataset/training/constant';

const logger = getLogger(LogCategories.MODULE.DATASET.TRAINING);

/** 失去租约不是业务失败，不扣重试次数，也不允许旧 worker 再写错误或结果。 */
export class TrainingLeaseLostError extends Error {
  constructor() {
    super('Training task lease lost');
  }
}

/**
 * 统一领取训练任务并启动心跳。调用方必须在 finally 中 stop；complete/transition/fail
 * 统一执行 CAS。模型调用放在提交回调外，回调只包含需要原子提交的 Mongo 写入。
 */
export const claimTrainingTask = async <T = Record<string, never>>(
  options: FindAndLockTrainingTaskOptions
) => {
  const data = await findAndLockTrainingTask<T>(options);
  if (!data) return;
  return {
    data,
    lease: createTrainingTaskLease(data as unknown as TrainingLeaseTask)
  };
};

export type TrainingTaskLease = ReturnType<typeof createTrainingTaskLease>;
type TrainingLeaseTask = Pick<
  DatasetTrainingSchemaType,
  '_id' | 'mode' | 'lockTime' | 'retryCount' | 'dataId' | 'teamId' | 'datasetId' | 'collectionId'
>;

/**
 * 以现有 lockTime + mode 为租约，不增加训练字段。续租失败时保守放弃本地写权限；
 * 任务不会被扣减重试次数，租约过期后由其他 worker 重新领取。
 */
export const createTrainingTaskLease = (task: TrainingLeaseTask) => {
  let lockTime = new Date(task.lockTime);
  let lost = false;
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  const abortController = new AbortController();
  const getFilter = () => ({ _id: task._id, mode: task.mode, lockTime });
  const lose = () => {
    lost = true;
    abortController.abort();
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  const assertOwned = () => {
    if (lost || Date.now() - lockTime.getTime() >= TRAINING_LEASE_TIMEOUT_MS) {
      lose();
      throw new TrainingLeaseLostError();
    }
  };

  const renewOnce = async () => {
    assertOwned();
    const previous = getFilter();
    const next = new Date(Math.max(Date.now(), lockTime.getTime() + 1));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        assertOwned();
        const result = await MongoDatasetTraining.updateOne(previous, { $set: { lockTime: next } });
        if (result.matchedCount !== 1) {
          lose();
          return;
        }
        lockTime = next;
        // 旧阶段仍读取训练对象上的 lockTime；同步更新引用可避免成功提交使用旧租约。
        (task as DatasetTrainingSchemaType).lockTime = next;
        assertOwned();
        return;
      } catch (error) {
        if (error instanceof TrainingLeaseLostError) return;
        logger.warn('Training heartbeat failed', { trainingId: task._id, attempt, error });
        if (attempt < 2) await delay(1000);
      }
    }
    // 无法确认所有权时保守退出。任务仍在库中，租约过期后可以重新领取。
    lose();
  };
  const renew = () => {
    if (closed || lost) return Promise.resolve();
    if (!pending) {
      pending = renewOnce()
        .catch(() => {
          lose();
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  };
  const stop = async () => {
    closed = true;
    if (timer) clearInterval(timer);
    timer = undefined;
    await pending;
  };

  /** 先停止心跳并等待在途续租，再通过事务内 CAS 提交阶段结果。 */
  const commit = async <R>(write: (session: ClientSession) => Promise<R>): Promise<R> => {
    await stop();
    assertOwned();
    return mongoSessionRun(async (session) => {
      assertOwned();
      const ownership = await MongoDatasetTraining.updateOne(
        getFilter(),
        { $set: { lockTime } },
        { session }
      );
      if (ownership.matchedCount !== 1) {
        lose();
        throw new TrainingLeaseLostError();
      }
      const output = await write(session);
      assertOwned();
      return output;
    });
  };
  const complete = async <R>(write?: (session: ClientSession) => Promise<R>) =>
    commit(async (session) => {
      const output = await write?.(session);
      const result = await MongoDatasetTraining.deleteOne(getFilter(), { session });
      if (result.deletedCount !== 1) {
        lose();
        throw new TrainingLeaseLostError();
      }
      return output;
    });
  const transition = async (
    next: Partial<DatasetTrainingSchemaType> & { mode: TrainingModeEnum }
  ) =>
    commit(async (session) => {
      const result = await MongoDatasetTraining.updateOne(
        getFilter(),
        {
          $set: { ...next, retryCount: 3, lockTime: new Date(0) },
          $unset: { errorMsg: '' }
        },
        { session }
      );
      if (result.matchedCount !== 1) {
        lose();
        throw new TrainingLeaseLostError();
      }
    });
  const fail = async (error: unknown, { terminal = false }: { terminal?: boolean } = {}) => {
    if (lost || error instanceof TrainingLeaseLostError) return;
    const retryCount = terminal ? 0 : Math.max(0, task.retryCount - 1);
    const errorMsg = getErrText(error, 'unknown error');
    try {
      await commit(async (session) => {
        const result = await MongoDatasetTraining.updateOne(
          getFilter(),
          {
            $set: {
              retryCount,
              errorMsg,
              // 明确失败后间隔一分钟再试；不是将 5 分钟租约改成 1 分钟。
              lockTime: new Date(
                Date.now() - TRAINING_LEASE_TIMEOUT_MS + TRAINING_LEASE_HEARTBEAT_MS
              ),
              // 最终错误保留供用户重试，不能被 TTL 删除后留下无任务的 indexing 数据。
              ...(retryCount === 0 ? { expireAt: null } : {})
            }
          },
          { session }
        );
        if (result.matchedCount !== 1) {
          lose();
          throw new TrainingLeaseLostError();
        }
        if (retryCount === 0 && task.dataId) {
          await MongoDatasetData.updateOne(
            {
              _id: task.dataId,
              teamId: task.teamId,
              datasetId: task.datasetId,
              collectionId: task.collectionId,
              indexStatus: DatasetDataIndexStatusEnum.indexing
            },
            { $set: { indexStatus: DatasetDataIndexStatusEnum.error, indexErrorMsg: errorMsg } },
            { session }
          );
        }
      });
    } catch (failure) {
      if (!(failure instanceof TrainingLeaseLostError)) throw failure;
    }
  };
  timer = setInterval(() => {
    void renew();
  }, TRAINING_LEASE_HEARTBEAT_MS);
  timer.unref?.();
  return {
    renew,
    stop,
    complete,
    transition,
    fail,
    commit,
    assertOwned,
    isLost: () => lost,
    signal: abortController.signal
  };
};

/**
 * 增强阶段结束后选择最终写入阶段，不在训练任务上额外保存预创建标记。
 * 只有已落库且仍在 indexing 的数据进入 index；普通创建和正式数据重建继续进入 chunk。
 */
export const getDatasetIndexTrainingMode = async (
  training: Pick<DatasetTrainingSchemaType, 'teamId' | 'datasetId' | 'collectionId' | 'dataId'>
) => {
  if (!training.dataId) return TrainingModeEnum.chunk;

  const data = await MongoDatasetData.exists({
    _id: training.dataId,
    teamId: training.teamId,
    datasetId: training.datasetId,
    collectionId: training.collectionId,
    indexStatus: DatasetDataIndexStatusEnum.indexing
  });
  return data ? TrainingModeEnum.index : TrainingModeEnum.chunk;
};

/**
 * 许可证关闭增强能力时逐条转入各自的最终写入阶段，避免将预创建数据误送入 rebuild。
 * 游标限制内存占用，更新时核对原 mode，避免覆盖并发 worker 已完成的阶段流转。
 */
export const skipDatasetTrainingEnhancement = async (
  mode: TrainingModeEnum.auto | TrainingModeEnum.image
) => {
  const cursor = MongoDatasetTraining.find({ mode })
    .select('_id teamId datasetId collectionId dataId')
    .lean()
    .cursor();
  try {
    for await (const training of cursor) {
      await MongoDatasetTraining.updateOne(
        { _id: training._id, mode },
        { $set: { mode: await getDatasetIndexTrainingMode(training) } }
      );
    }
  } finally {
    await cursor.close();
  }
};
