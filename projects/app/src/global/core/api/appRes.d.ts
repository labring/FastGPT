import type { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

export type GetAppDatasetCollectionResponse = {
  datasets: Array<{
    datasetId: string;
    datasetName: string;
    avatar: string;

    collections: Array<{
      collectionId: string;
      collectionName: string;
      type: DatasetCollectionTypeEnum;
      parentId?: string;
    }>;
  }>;
};
