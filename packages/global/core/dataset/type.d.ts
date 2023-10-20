import { DatasetCollectionTypeEnum, DatasetTypeEnum, TrainingModeEnum } from './constant';

export type DatasetSchemaType = {
  _id: string;
  userId: string;
  parentId: string;
  updateTime: Date;
  avatar: string;
  name: string;
  vectorModel: string;
  tags: string[];
  type: `${DatasetTypeEnum}`;
};

export type DatasetCollectionSchemaType = {
  _id: string;
  userId: string;
  datasetId: string;
  parentId?: string;
  name: string;
  type: `${DatasetCollectionTypeEnum}`;
  updateTime: Date;
  metadata: {
    fileId?: string;
    rawLink?: string;
    pgCollectionId?: string;
  };
};

export type DatasetTrainingSchemaType = {
  _id: string;
  userId: string;
  datasetId: string;
  datasetCollectionId: string;
  billId: string;
  expireAt: Date;
  lockTime: Date;
  mode: `${TrainingModeEnum}`;
  model: string;
  prompt: string;
  q: string;
  a: string;
};

/* ================= dataset ===================== */

/* ================= collection ===================== */

/* ================= data ===================== */
export type PgDataItemType = {
  id: string;
  q: string;
  a: string;
  dataset_id: string;
  collection_id: string;
};
export type DatasetChunkItemType = {
  q: string;
  a: string;
};
export type DatasetDataItemType = DatasetChunkItemType & {
  id: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
};

/* ============= search =============== */
export type SearchDataResultItemType = PgDataItemType & {
  score: number;
};
export type SearchDataResponseItemType = DatasetDataItemType & {
  score: number;
};
