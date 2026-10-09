import { DatasetDataIndexStatusEnum, DatasetDataIndexTypeEnum } from './constants';

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
 * 数据是否已完成索引。
 *
 * 字段缺失代表变更前创建的历史数据：其创建路径先写向量再写主数据，业务语义上已完成
 * 索引，因此运行时一律按 indexed 处理，且不回填字段。
 */
export const isDatasetDataIndexed = (indexStatus?: DatasetDataIndexStatusEnum) =>
  indexStatus === undefined || indexStatus === DatasetDataIndexStatusEnum.indexed;

/** 首次索引及两类重建的待处理/处理中状态；页面轮询与数据写保护使用相同边界。 */
export const isDatasetDataProcessing = (indexStatus?: DatasetDataIndexStatusEnum) =>
  indexStatus !== undefined &&
  [
    DatasetDataIndexStatusEnum.indexing,
    DatasetDataIndexStatusEnum.rebuildIndexPending,
    DatasetDataIndexStatusEnum.rebuildIndexRunning,
    DatasetDataIndexStatusEnum.rebuildSynonymPending,
    DatasetDataIndexStatusEnum.rebuildSynonymRunning
  ].includes(indexStatus);

/** 重建失败仍保有旧索引；只有完整替换索引后才能结束对应失败任务。 */
export const isDatasetDataRebuildFailed = (indexStatus?: DatasetDataIndexStatusEnum) =>
  indexStatus === DatasetDataIndexStatusEnum.rebuildIndexFailed ||
  indexStatus === DatasetDataIndexStatusEnum.rebuildSynonymFailed;

/** 正在重建或等待入队的数据；失败任务由 training 队列继续管理。 */
export const rebuildingDatasetDataMatch = {
  indexStatus: {
    $in: [
      DatasetDataIndexStatusEnum.rebuildIndexPending,
      DatasetDataIndexStatusEnum.rebuildIndexRunning,
      DatasetDataIndexStatusEnum.rebuildSynonymPending,
      DatasetDataIndexStatusEnum.rebuildSynonymRunning
    ]
  }
};

/**
 * 已完成索引（或字段缺失）的 Mongo 查询条件。
 * 用于 trainedCount 统计、重建选择和写入保护等需要区分待索引数据的场景。
 */
export const indexedDatasetDataMatch = {
  $or: [{ indexStatus: DatasetDataIndexStatusEnum.indexed }, { indexStatus: { $exists: false } }]
};

/** 重建失败的数据仍保有旧索引；取消旧任务后，后续模型/同义词重建必须仍能选中它。 */
export const rebuildableDatasetDataMatch = {
  $or: [
    {
      indexStatus: {
        $in: [
          DatasetDataIndexStatusEnum.indexed,
          DatasetDataIndexStatusEnum.rebuildIndexFailed,
          DatasetDataIndexStatusEnum.rebuildSynonymFailed
        ]
      }
    },
    { indexStatus: { $exists: false } }
  ]
};
