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

import { getTrainingTaskReadyUpdate } from './utils';
import { BLOCKED_LOCK_TIME, finalErrorTrainingMatch } from './query';

const logger = getLogger(LogCategories.MODULE.DATASET.TRAINING);

/** 失去租约不是业务失败，不扣重试次数，也不允许旧 worker 再写错误或结果。 */
export class TrainingLeaseLostError extends Error {
  constructor() {
    super('Training task lease lost');
  }
}

/**
 * 统一领取训练任务并创建租约，不隐式启动心跳。调用方在任务最外层 try 中 start、finally 中 stop。
 * complete/transition/fail 统一执行 CAS。模型调用放在提交回调外，回调只包含需要原子提交的 Mongo 写入。
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
/** 阶段结果只允许更新业务内容；身份、租约及重试字段由租约实现维护。 */
type TrainingStageResult = Pick<DatasetTrainingSchemaType, 'mode'> &
  Partial<Pick<DatasetTrainingSchemaType, 'q' | 'a' | 'indexes' | 'imageDescMap'>>;

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
  /** 提交前冻结续租并等待在途写入，定时器统一由任务最外层 finally 释放。 */
  const freezeHeartbeat = async () => {
    closed = true;
    await pending;
  };
  const start = () => {
    if (closed || lost || timer) return;
    timer = setInterval(() => {
      void renew();
    }, TRAINING_LEASE_HEARTBEAT_MS);
    timer.unref?.();
  };
  const stop = async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    await freezeHeartbeat();
  };

  /** 冻结 lockTime 后通过事务内 CAS 提交，避免续租与阶段结果写入竞争。 */
  const commit = async <R>(write: (session: ClientSession) => Promise<R>): Promise<R> => {
    await freezeHeartbeat();
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
  const transition = async (next: TrainingStageResult) =>
    commit(async (session) => {
      const readyUpdate = getTrainingTaskReadyUpdate();
      const result = await MongoDatasetTraining.updateOne(
        getFilter(),
        {
          $set: { ...next, ...readyUpdate.$set },
          $unset: readyUpdate.$unset
        },
        { session }
      );
      if (result.matchedCount !== 1) {
        lose();
        throw new TrainingLeaseLostError();
      }
    });
  const fail = async (
    error: unknown,
    {
      terminal = false,
      blocked = false,
      retryDelayMs = TRAINING_LEASE_HEARTBEAT_MS
    }: { terminal?: boolean; blocked?: boolean; retryDelayMs?: number } = {}
  ) => {
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
              // 暂停使用统一锁时间；默认一分钟后重试，parse 可显式保留即时重试。
              lockTime: blocked
                ? BLOCKED_LOCK_TIME
                : new Date(Date.now() - TRAINING_LEASE_TIMEOUT_MS + retryDelayMs),
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
        // data 的错误状态只表示最终索引写入失败，不能由前置增强阶段写入。
        if (
          (retryCount === 0 || blocked) &&
          [TrainingModeEnum.index, TrainingModeEnum.rebuild].includes(task.mode) &&
          task.dataId
        ) {
          await MongoDatasetData.updateOne(
            {
              _id: task.dataId,
              teamId: task.teamId,
              datasetId: task.datasetId,
              collectionId: task.collectionId,
              indexStatus:
                task.mode === TrainingModeEnum.rebuild
                  ? DatasetDataIndexStatusEnum.rebuildIndexRunning
                  : DatasetDataIndexStatusEnum.indexing
            },
            {
              $set: {
                indexStatus:
                  task.mode === TrainingModeEnum.rebuild
                    ? DatasetDataIndexStatusEnum.rebuildIndexFailed
                    : DatasetDataIndexStatusEnum.error,
                indexErrorMsg: errorMsg
              }
            },
            { session }
          );
        }
      });
    } catch (failure) {
      if (!(failure instanceof TrainingLeaseLostError)) throw failure;
    }
  };
  return {
    start,
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
 * 待索引和索引失败的数据进入 index，正式数据进入 rebuild。历史无 dataId 任务须先运行迁移补齐关联。
 */
export const getDatasetIndexTrainingMode = async (
  training: Pick<DatasetTrainingSchemaType, 'teamId' | 'datasetId' | 'collectionId' | 'dataId'>
) => {
  if (!training.dataId)
    throw new Error('Training dataId is missing; migrate legacy training first');

  const data = await MongoDatasetData.exists({
    _id: training.dataId,
    teamId: training.teamId,
    datasetId: training.datasetId,
    collectionId: training.collectionId,
    indexStatus: { $in: [DatasetDataIndexStatusEnum.indexing, DatasetDataIndexStatusEnum.error] }
  });
  return data ? TrainingModeEnum.index : TrainingModeEnum.rebuild;
};

/**
 * 许可证关闭增强能力时逐条转入各自的最终写入阶段，避免将预创建数据误送入 rebuild。
 * 游标限制内存占用，更新时核对原 mode，避免覆盖并发 worker 已完成的阶段流转。
 * 新阶段恢复重试和可领取状态；历史终态任务转入 index 时恢复 TTL，重建任务保留其过期策略。
 */
export const skipDatasetTrainingEnhancement = async (
  mode: TrainingModeEnum.auto | TrainingModeEnum.image | TrainingModeEnum.imageParse
) => {
  const cursor = MongoDatasetTraining.find({ mode })
    .select('_id teamId datasetId collectionId dataId')
    .lean()
    .cursor();
  try {
    for await (const training of cursor) {
      const nextMode = await getDatasetIndexTrainingMode(training);
      const readyUpdate = getTrainingTaskReadyUpdate({
        restoreExpiration: nextMode === TrainingModeEnum.index
      });
      await MongoDatasetTraining.updateOne(
        { _id: training._id, mode },
        { ...readyUpdate, $set: { ...readyUpdate.$set, mode: nextMode } }
      );
    }
  } finally {
    await cursor.close();
  }
};

/**
 * 分批重试授权范围内的失败任务，每批将任务恢复与 data 状态恢复放入同一事务。
 * 按 _id 单向前进并固定起始上界，避免 worker 再次失败或新任务加入导致同一请求无限重试。
 * 已提交批次可安全保留，后续请求只处理仍失败的任务；每批最多 500 条。
 */
export const retryFailedTrainingTasks = async (
  scope: Pick<DatasetTrainingSchemaType, 'teamId' | 'datasetId'> &
    Partial<Pick<DatasetTrainingSchemaType, 'collectionId'>>
) => {
  const lastTask = await MongoDatasetTraining.findOne({ ...scope, ...finalErrorTrainingMatch })
    .sort({ _id: -1 })
    .select('_id')
    .lean();
  if (!lastTask) return;
  let afterId: string | undefined;
  while (true) {
    const batch = await mongoSessionRun(async (session) => {
      const tasks = await MongoDatasetTraining.find({
        ...scope,
        ...finalErrorTrainingMatch,
        _id: { $lte: lastTask._id, ...(afterId ? { $gt: afterId } : {}) }
      })
        .sort({ _id: 1 })
        .limit(500)
        .select('_id dataId mode')
        .session(session)
        .lean();
      if (!tasks.length) return tasks;
      await MongoDatasetTraining.updateMany(
        { ...scope, _id: { $in: tasks.map((task) => task._id) }, ...finalErrorTrainingMatch },
        getTrainingTaskReadyUpdate(),
        { session }
      );
      const rebuildDataIds = tasks.flatMap((task) =>
        task.mode === TrainingModeEnum.rebuild && task.dataId ? [task.dataId] : []
      );
      if (rebuildDataIds.length) {
        await MongoDatasetData.updateMany(
          {
            ...scope,
            _id: { $in: rebuildDataIds },
            indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed
          },
          {
            $set: { indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning },
            $unset: { indexErrorMsg: '' }
          },
          { session }
        );
      }
      const dataIds = tasks.flatMap((task) =>
        task.mode !== TrainingModeEnum.rebuild && task.dataId ? [task.dataId] : []
      );
      if (dataIds.length) {
        await MongoDatasetData.updateMany(
          { ...scope, _id: { $in: dataIds }, indexStatus: DatasetDataIndexStatusEnum.error },
          {
            $set: { indexStatus: DatasetDataIndexStatusEnum.indexing },
            $unset: { indexErrorMsg: '' }
          },
          { session }
        );
      }
      return tasks;
    });
    if (!batch.length) break;
    afterId = String(batch[batch.length - 1]._id);
  }
};
