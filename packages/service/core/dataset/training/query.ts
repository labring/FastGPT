import {
  CollectionTrainingStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';

type TrainingStatusCount = {
  activeCount: number;
  finalErrorCount: number;
};

export const BLOCKED_LOCK_TIME = new Date('2050-01-01');

export const trainingModeRankMap: Record<TrainingModeEnum, number> = {
  [TrainingModeEnum.parse]: 0,
  [TrainingModeEnum.imageParse]: 1,
  [TrainingModeEnum.qa]: 2,
  [TrainingModeEnum.image]: 3,
  [TrainingModeEnum.auto]: 4,
  [TrainingModeEnum.chunk]: 5
};

export const trainingModeRanks = Object.values(TrainingModeEnum).map((mode) => ({
  mode,
  rank: trainingModeRankMap[mode]
}));

const trimmedErrorMsgExpr = (fieldPath = '$errorMsg') => ({
  $trim: {
    input: {
      $ifNull: [fieldPath, '']
    }
  }
});

/**
 * 判断训练记录是否有有效错误信息。空字符串和纯空白字符串都视为无错误，
 * 避免自动重试或历史脏数据被错误计入最终异常。
 */
export const hasEffectiveErrorMsg = (training?: Pick<DatasetTrainingSchemaType, 'errorMsg'>) => {
  return typeof training?.errorMsg === 'string' && training.errorMsg.trim() !== '';
};

/**
 * active 表示仍可能被训练队列继续处理的剩余任务，包含普通排队/训练中和自动重试中。
 * 这里不判断 lockTime 是否已经到达队列可消费时间，只判断未被永久锁定。
 */
export const isActiveTraining = (
  training?: Pick<DatasetTrainingSchemaType, 'retryCount' | 'lockTime'>
) => {
  return (training?.retryCount ?? 0) > 0 && new Date(training?.lockTime ?? 0) < BLOCKED_LOCK_TIME;
};

export const isTemporarilyFailedTraining = (
  training?: Pick<DatasetTrainingSchemaType, 'retryCount' | 'lockTime' | 'errorMsg'>
) => {
  return hasEffectiveErrorMsg(training) && isActiveTraining(training);
};

export const isFinalErrorTraining = (
  training?: Pick<DatasetTrainingSchemaType, 'retryCount' | 'lockTime' | 'errorMsg'>
) => {
  return (
    hasEffectiveErrorMsg(training) &&
    ((training?.retryCount ?? 0) <= 0 || new Date(training?.lockTime ?? 0) >= BLOCKED_LOCK_TIME)
  );
};

export const isRemainingTraining = (
  training?: Pick<DatasetTrainingSchemaType, 'retryCount' | 'lockTime' | 'errorMsg'>
) => {
  return isActiveTraining(training) || isFinalErrorTraining(training);
};

export const hasEffectiveErrorMsgExpr = { $gt: [{ $strLenCP: trimmedErrorMsgExpr() }, 0] };
export const activeTrainingExpr = {
  $and: [{ $gt: ['$retryCount', 0] }, { $lt: ['$lockTime', BLOCKED_LOCK_TIME] }]
};
export const finalErrorTrainingExpr = {
  $and: [
    hasEffectiveErrorMsgExpr,
    {
      $or: [{ $lte: ['$retryCount', 0] }, { $gte: ['$lockTime', BLOCKED_LOCK_TIME] }]
    }
  ]
};
export const remainingTrainingExpr = {
  $or: [activeTrainingExpr, finalErrorTrainingExpr]
};

export const hasEffectiveErrorMsgMatch = {
  $expr: hasEffectiveErrorMsgExpr
};
export const activeTrainingMatch = {
  retryCount: { $gt: 0 },
  lockTime: { $lt: BLOCKED_LOCK_TIME }
};
export const finalErrorTrainingMatch = {
  $expr: finalErrorTrainingExpr
};
export const remainingTrainingMatch = {
  $or: [activeTrainingMatch, finalErrorTrainingMatch]
};

/**
 * rank 越小表示流程越早；collection 的“最慢阶段”就是剩余任务里流程最早的阶段。
 */
export const getTrainingModeRank = (mode?: TrainingModeEnum) => {
  if (!mode) return Number.MAX_SAFE_INTEGER;
  return trainingModeRankMap[mode] ?? Number.MAX_SAFE_INTEGER;
};

/**
 * 返回流程中更早的训练阶段，用于计算用户感知上的“最慢阶段”。
 */
export const compareTrainingModeBySlowest = (a?: TrainingModeEnum, b?: TrainingModeEnum) => {
  return getTrainingModeRank(a) - getTrainingModeRank(b);
};

export const getSlowestTrainingMode = (modes: Array<TrainingModeEnum | undefined>) => {
  return modes.filter(Boolean).sort((a, b) => compareTrainingModeBySlowest(a, b))[0] as
    | TrainingModeEnum
    | undefined;
};

/**
 * 根据各阶段 active/final error 数量计算 collection 级最慢阶段状态。
 * 最慢阶段只有最终异常时才展示 error。
 */
export const getSlowestTrainingStatus = (
  modeCounts: Partial<Record<TrainingModeEnum, TrainingStatusCount>>
) => {
  const slowestTrainingMode = getSlowestTrainingMode(
    Object.entries(modeCounts)
      .filter(([, count]) => (count?.activeCount ?? 0) + (count?.finalErrorCount ?? 0) > 0)
      .map(([mode]) => mode as TrainingModeEnum)
  );

  if (!slowestTrainingMode) {
    return {
      slowestTrainingStatus: CollectionTrainingStatusEnum.ready
    };
  }

  const slowestCounts = modeCounts[slowestTrainingMode];
  return {
    slowestTrainingMode,
    slowestTrainingStatus:
      (slowestCounts?.activeCount ?? 0) > 0
        ? CollectionTrainingStatusEnum.running
        : CollectionTrainingStatusEnum.error
  };
};
