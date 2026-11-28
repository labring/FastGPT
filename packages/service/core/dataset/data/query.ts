import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum
} from '@fastgpt/global/core/dataset/data/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  datasetDataDocumentWorkStatuses,
  datasetDataRebuildFailedStatuses,
  datasetDataRebuildIndexProcessingStatuses,
  datasetDataRebuildSynonymProcessingStatuses,
  indexedDatasetDataExpr,
  isDatasetDataSynonymRebuild
} from '@fastgpt/global/core/dataset/data/utils';

/** 集合列表和详情共用相同的数据阶段筛选。 */
export const datasetDataTrainingStatusMatch = {
  indexStatus: { $in: [...datasetDataDocumentWorkStatuses, ...datasetDataRebuildFailedStatuses] }
};

/** 只匹配文档训练 Worker 可以领取的分块。 */
export const getRunnableDatasetIndexMatch = (synonymEnabled: boolean) => ({
  indexStatus: {
    $in: synonymEnabled
      ? datasetDataDocumentWorkStatuses
      : datasetDataDocumentWorkStatuses.filter((status) => !isDatasetDataSynonymRebuild(status))
  },
  indexError: { $ne: true }
});

const indexFailed = { $eq: [{ $ifNull: ['$indexError', false] }, true] };
const sumCondition = (condition: Record<string, unknown>) => ({
  $sum: { $cond: [condition, 1, 0] }
});
const countRebuild = (
  statuses: DatasetDataIndexStageEnum[],
  historicalFailure: DatasetDataIndexStatusEnum
) => {
  const rebuilding = { $in: ['$indexStatus', statuses] };
  return {
    active: sumCondition({ $and: [rebuilding, { $not: [indexFailed] }] }),
    failed: sumCondition({
      $or: [{ $eq: ['$indexStatus', historicalFailure] }, { $and: [rebuilding, indexFailed] }]
    })
  };
};
const modelRebuild = countRebuild(
  datasetDataRebuildIndexProcessingStatuses,
  DatasetDataIndexStatusEnum.rebuildIndexFailed
);
const synonymRebuild = countRebuild(
  datasetDataRebuildSynonymProcessingStatuses,
  DatasetDataIndexStatusEnum.rebuildSynonymFailed
);

export const datasetDataRebuildStatusCountFields = {
  rebuildIndexActiveCount: modelRebuild.active,
  rebuildIndexFailedCount: modelRebuild.failed,
  rebuildSynonymActiveCount: synonymRebuild.active,
  rebuildSynonymFailedCount: synonymRebuild.failed
};

const countRunningRebuild = (status: DatasetDataIndexStageEnum) =>
  sumCondition({ $and: [{ $eq: ['$indexStatus', status] }, { $not: [indexFailed] }] });

export const datasetDataRunningRebuildCountFields = {
  rebuildIndexRunningCount: countRunningRebuild(DatasetDataIndexStageEnum.rebuildIndexRunning),
  rebuildSynonymRunningCount: countRunningRebuild(DatasetDataIndexStageEnum.rebuildSynonymRunning)
};

/** 公开阶段名和首次训练的 data 阶段同值，保持集合进度 DTO 的阶段枚举。 */
export const documentIndexTrainingModes = [
  TrainingModeEnum.imageParse,
  TrainingModeEnum.image,
  TrainingModeEnum.auto,
  TrainingModeEnum.index
] as const;

const countDocumentIndexStage = (
  mode: (typeof documentIndexTrainingModes)[number],
  failed: boolean
) =>
  sumCondition({
    $and: [{ $eq: ['$indexStatus', mode] }, { $eq: [{ $ifNull: ['$indexError', false] }, failed] }]
  });

/** 文档训练的阶段保留在 data 上，单条错误通过独立标记区分。 */
export const datasetDataTrainingStatusCountFields = {
  ...datasetDataRebuildStatusCountFields,
  imageParseActiveCount: countDocumentIndexStage(TrainingModeEnum.imageParse, false),
  imageParseErrorCount: countDocumentIndexStage(TrainingModeEnum.imageParse, true),
  imageActiveCount: countDocumentIndexStage(TrainingModeEnum.image, false),
  imageErrorCount: countDocumentIndexStage(TrainingModeEnum.image, true),
  autoActiveCount: countDocumentIndexStage(TrainingModeEnum.auto, false),
  autoErrorCount: countDocumentIndexStage(TrainingModeEnum.auto, true),
  indexActiveCount: countDocumentIndexStage(TrainingModeEnum.index, false),
  indexErrorCount: countDocumentIndexStage(TrainingModeEnum.index, true)
};

/** 弹窗还需统计已就绪数量；缺失状态的历史数据按已就绪处理，null 不计入。 */
export const datasetDataStatusCountFields = {
  count: { $sum: 1 },
  trainedCount: sumCondition(indexedDatasetDataExpr),
  ...datasetDataTrainingStatusCountFields
};

export type DatasetDataRebuildStatusCounts = {
  rebuildIndexActiveCount: number;
  rebuildIndexFailedCount: number;
  rebuildSynonymActiveCount: number;
  rebuildSynonymFailedCount: number;
};

export type DatasetDataTrainingStatusCounts = {
  [key in keyof typeof datasetDataTrainingStatusCountFields]: number;
};

export type DatasetDataStatusCounts = DatasetDataTrainingStatusCounts & {
  count: number;
  trainedCount: number;
};
