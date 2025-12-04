import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

export const isDatabaseDataset = (datasetType: string) =>
  datasetType === DatasetTypeEnum.database || datasetType === DatasetTypeEnum.structureDocument;
