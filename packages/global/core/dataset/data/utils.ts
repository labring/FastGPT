import { DatasetDataIndexTypeEnum } from './constants';

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
