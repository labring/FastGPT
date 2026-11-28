import {
  CollectionTrainingStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { CollectionTrainingStatusType } from '@fastgpt/global/core/dataset/type';
import type { DatasetQaTrainingCounts } from '@fastgpt/dal/db/repos/datasetQaTraining/repo.type';
import { documentIndexTrainingModes, type DatasetDataTrainingStatusCounts } from '../data/query';

type TrainingStatusCount = {
  activeCount: number;
  finalErrorCount: number;
};

// 训练错误响应以原锁定值表示欠费。
export const BLOCKED_LOCK_TIME = new Date('2050-01-01');

export const trainingModeRankMap: Record<TrainingModeEnum, number> = {
  // 保留公开枚举的排序键。
  [TrainingModeEnum.chunk]: 5,
  [TrainingModeEnum.parse]: 0,
  [TrainingModeEnum.imageParse]: 1,
  [TrainingModeEnum.qa]: 2,
  [TrainingModeEnum.image]: 3,
  [TrainingModeEnum.auto]: 4,
  [TrainingModeEnum.rebuildIndex]: 5,
  [TrainingModeEnum.rebuildSynonym]: 5,
  [TrainingModeEnum.index]: 5
};

export const trainingModeRanks = Object.values(TrainingModeEnum).map((mode) => ({
  mode,
  rank: trainingModeRankMap[mode]
}));

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

/**
 * 合并普通训练阶段与 data 的重建状态，统一集合列表和详情的数量及最慢阶段。
 * 重建以 data 为唯一统计来源；覆盖 training 的 rebuild 数量，避免排队、执行或残留任务重复计数。
 */
export const getCollectionTrainingStatusByMode = ({
  modeCounts,
  rebuildIndexCounts = { activeCount: 0, finalErrorCount: 0 },
  rebuildSynonymCounts = { activeCount: 0, finalErrorCount: 0 }
}: {
  modeCounts: Partial<Record<TrainingModeEnum, TrainingStatusCount>>;
  rebuildIndexCounts?: TrainingStatusCount;
  rebuildSynonymCounts?: TrainingStatusCount;
}): CollectionTrainingStatusType => {
  const counts = {
    ...modeCounts,
    [TrainingModeEnum.rebuildIndex]: rebuildIndexCounts,
    [TrainingModeEnum.rebuildSynonym]: rebuildSynonymCounts
  };
  const activeTrainingAmount = Object.values(counts).reduce(
    (sum, count) => sum + (count?.activeCount ?? 0),
    0
  );
  const finalErrorAmount = Object.values(counts).reduce(
    (sum, count) => sum + (count?.finalErrorCount ?? 0),
    0
  );
  return {
    trainingAmount: activeTrainingAmount + finalErrorAmount,
    activeTrainingAmount,
    finalErrorAmount,
    hasError: finalErrorAmount > 0,
    ...getSlowestTrainingStatus(counts)
  };
};

/**
 * 合并文档训练和重建计数，供列表和详情共用。
 * 文档因欠费暂停时，待索引项在接口上计为异常。
 */
export const getCollectionTrainingStatusFromCounts = ({
  dataCounts,
  qaCounts,
  parseStatus,
  pausedUnpaid = false
}: {
  dataCounts?: DatasetDataTrainingStatusCounts;
  qaCounts?: DatasetQaTrainingCounts;
  parseStatus?: 'active' | 'error';
  pausedUnpaid?: boolean;
}): CollectionTrainingStatusType => {
  const counts: Partial<Record<TrainingModeEnum, TrainingStatusCount>> = {};
  const addDocumentCounts = ({
    mode,
    pending,
    failed
  }: {
    mode: TrainingModeEnum;
    pending: number;
    failed: number;
  }) => {
    counts[mode] = {
      activeCount: pausedUnpaid ? 0 : pending,
      finalErrorCount: failed + (pausedUnpaid ? pending : 0)
    };
  };
  for (const mode of documentIndexTrainingModes) {
    addDocumentCounts({
      mode,
      pending: dataCounts?.[`${mode}ActiveCount`] ?? 0,
      failed: dataCounts?.[`${mode}ErrorCount`] ?? 0
    });
  }
  addDocumentCounts({
    mode: TrainingModeEnum.qa,
    pending: qaCounts?.activeCount ?? 0,
    failed: qaCounts?.finalErrorCount ?? 0
  });
  addDocumentCounts({
    mode: TrainingModeEnum.parse,
    pending: parseStatus === 'active' ? 1 : 0,
    failed: parseStatus === 'error' ? 1 : 0
  });

  const rebuildCounts = (pending = 0, failed = 0) => ({
    activeCount: pausedUnpaid ? 0 : pending,
    finalErrorCount: failed + (pausedUnpaid ? pending : 0)
  });

  return getCollectionTrainingStatusByMode({
    modeCounts: counts,
    rebuildIndexCounts: rebuildCounts(
      dataCounts?.rebuildIndexActiveCount,
      dataCounts?.rebuildIndexFailedCount
    ),
    rebuildSynonymCounts: rebuildCounts(
      dataCounts?.rebuildSynonymActiveCount,
      dataCounts?.rebuildSynonymFailedCount
    )
  });
};
