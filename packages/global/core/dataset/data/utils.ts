import { TrainingModeEnum } from '../constants';
import {
  DatasetDataIndexStageEnum,
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum,
  type DatasetDataStoredIndexStatus
} from './constants';

export const datasetDataDocumentTrainingStatuses = [
  DatasetDataIndexStageEnum.imageParse,
  DatasetDataIndexStageEnum.image,
  DatasetDataIndexStageEnum.auto,
  DatasetDataIndexStageEnum.index
] as const;

export type DatasetDataDocumentTrainingStatus =
  (typeof datasetDataDocumentTrainingStatuses)[number];

/** 初次训练入口按既有训练模式决定文档内首个分块阶段。 */
export const datasetDataDocumentTrainingStatusByMode: Partial<
  Record<TrainingModeEnum, DatasetDataDocumentTrainingStatus>
> = {
  [TrainingModeEnum.imageParse]: DatasetDataIndexStageEnum.imageParse,
  [TrainingModeEnum.image]: DatasetDataIndexStageEnum.image,
  [TrainingModeEnum.auto]: DatasetDataIndexStageEnum.auto,
  [TrainingModeEnum.index]: DatasetDataIndexStageEnum.index
};

/** 识别新建分块处于文档训练的增强阶段或最终索引阶段。 */
export const isDatasetDataDocumentTrainingStatus = (
  status?: DatasetDataStoredIndexStatus
): status is DatasetDataDocumentTrainingStatus =>
  datasetDataDocumentTrainingStatuses.some((value) => value === status);

export const datasetDataSystemIndexTypes = [
  DatasetDataIndexTypeEnum.default,
  DatasetDataIndexTypeEnum.imageEmbedding
] as const;

const datasetDataSystemIndexTypeSet = new Set<DatasetDataIndexTypeEnum>(
  datasetDataSystemIndexTypes
);

/**
 * 判断索引类型是否由数据内容自动生成和维护。
 *
 * 系统索引会随 data 的 q/a/imageId/markdown 图片重新生成，前端和后端都不应把它当作
 * 用户可手动编辑的外部索引处理。
 */
export const isDatasetDataSystemIndexType = (type?: DatasetDataIndexTypeEnum) =>
  datasetDataSystemIndexTypeSet.has(type || DatasetDataIndexTypeEnum.custom);

/**
 * 用户可手动编辑的索引，即系统索引的补集。
 *
 * 系统索引的文本就是 q/a 或图片描述，原样导出会在回导时被当成用户索引重新写入。
 */
export const getDatasetDataExternalIndexes = <T extends { type?: DatasetDataIndexTypeEnum }>(
  indexes?: T[] | null
): T[] => (indexes || []).filter((index) => !isDatasetDataSystemIndexType(index.type));

/**
 * 数据是否已完成索引。
 *
 * 历史记录可带 indexed，文档训练在提交向量和全文索引后移除状态。
 * 字段缺失的更早数据也是先写向量再写主数据，因此沿用相同完成语义。
 */
export const isDatasetDataIndexed = (indexStatus?: DatasetDataStoredIndexStatus) =>
  indexStatus === undefined || indexStatus === DatasetDataIndexStatusEnum.indexed;

export const datasetDataRebuildIndexProcessingStatuses = [
  DatasetDataIndexStageEnum.rebuildIndexPending,
  DatasetDataIndexStageEnum.rebuildIndexRunning
];
export const datasetDataRebuildSynonymProcessingStatuses = [
  DatasetDataIndexStageEnum.rebuildSynonymPending,
  DatasetDataIndexStageEnum.rebuildSynonymRunning
];

export const isDatasetDataModelRebuild = (status?: DatasetDataStoredIndexStatus) =>
  datasetDataRebuildIndexProcessingStatuses.some((stage) => stage === status);

export const isDatasetDataSynonymRebuild = (status?: DatasetDataStoredIndexStatus) =>
  datasetDataRebuildSynonymProcessingStatuses.some((stage) => stage === status);

export const datasetDataRebuildFailedStatuses = [
  DatasetDataIndexStatusEnum.rebuildIndexFailed,
  DatasetDataIndexStatusEnum.rebuildSynonymFailed
];

/** 文档 Worker 能处理的阶段。 */
export const datasetDataDocumentWorkStatuses = Object.values(DatasetDataIndexStageEnum);

/** 判断分块是否归文档 Worker 调度。 */
export const isDatasetDataDocumentWorkStatus = (
  status?: DatasetDataStoredIndexStatus
): status is DatasetDataIndexStageEnum =>
  datasetDataDocumentWorkStatuses.some((stage) => stage === status);

/** 等待或执行重建中的分块。 */
export const rebuildingDatasetDataMatch = {
  indexStatus: {
    $in: [
      ...datasetDataRebuildIndexProcessingStatuses,
      ...datasetDataRebuildSynonymProcessingStatuses
    ]
  },
  indexError: { $ne: true }
};

type DatasetDataIndexState = {
  indexStatus?: DatasetDataStoredIndexStatus;
  indexError?: boolean;
};

/** 分块 API 的等待与进行中状态，供前端轮询使用。 */
export const isDatasetDataProcessing = (indexStatus?: DatasetDataIndexStatusEnum) =>
  indexStatus !== undefined &&
  (indexStatus === DatasetDataIndexStatusEnum.indexing ||
    isDatasetDataModelRebuild(indexStatus) ||
    isDatasetDataSynonymRebuild(indexStatus));

/** 服务端从持久化阶段和错误标记判断写保护。 */
export const isDatasetDataIndexActive = ({ indexStatus, indexError }: DatasetDataIndexState) =>
  !indexError &&
  (isDatasetDataDocumentWorkStatus(indexStatus) || isDatasetDataProcessing(indexStatus));

/** 分块读 API 将新阶段投影为仍由前端使用的兼容状态。 */
export const getPublicDatasetDataIndexStatus = ({
  indexStatus,
  indexError
}: DatasetDataIndexState): DatasetDataIndexStatusEnum | undefined => {
  if (isDatasetDataDocumentTrainingStatus(indexStatus)) {
    return indexError ? DatasetDataIndexStatusEnum.error : DatasetDataIndexStatusEnum.indexing;
  }
  if (indexError) {
    if (isDatasetDataModelRebuild(indexStatus))
      return DatasetDataIndexStatusEnum.rebuildIndexFailed;
    if (isDatasetDataSynonymRebuild(indexStatus))
      return DatasetDataIndexStatusEnum.rebuildSynonymFailed;
  }
  return indexStatus === undefined ? undefined : DatasetDataIndexStatusEnum[indexStatus];
};

/** 失败数据手动保存时需要完整重算索引。旧任务按原记录状态识别。 */
export const isDatasetDataFailed = ({ indexStatus, indexError }: DatasetDataIndexState) =>
  indexError === true ||
  indexStatus === DatasetDataIndexStatusEnum.error ||
  (indexStatus !== undefined &&
    datasetDataRebuildFailedStatuses.some((status) => status === indexStatus));

/**
 * 已完成索引（或字段缺失）的 Mongo 查询条件。
 * 用于 trainedCount 统计、重建选择和写入保护等需要区分待索引数据的场景。
 */
export const indexedDatasetDataMatch = {
  $or: [{ indexStatus: DatasetDataIndexStatusEnum.indexed }, { indexStatus: { $exists: false } }]
};

/** 聚合中的已索引判断。读取原始文档，避免索引把缺失字段视为 null。 */
export const indexedDatasetDataExpr = {
  $let: {
    vars: { data: '$$ROOT' },
    in: {
      $or: [
        { $eq: ['$$data.indexStatus', DatasetDataIndexStatusEnum.indexed] },
        { $eq: [{ $type: '$$data.indexStatus' }, 'missing'] }
      ]
    }
  }
};

/** 重建失败的分块仍保有已生成的索引，可重新安排重建。 */
export const rebuildableDatasetDataMatch = {
  $or: [
    {
      indexStatus: {
        $in: [DatasetDataIndexStatusEnum.indexed, ...datasetDataRebuildFailedStatuses]
      }
    },
    { indexStatus: { $exists: false } },
    { indexStatus: rebuildingDatasetDataMatch.indexStatus, indexError: true }
  ]
};
