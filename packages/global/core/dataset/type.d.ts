import { PermissionTypeEnum } from '../../support/permission/constant';
import {
  DatasetCollectionTypeEnum,
  DatasetDataIndexTypeEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from './constant';

export type DatasetSchemaType = {
  _id: string;
  parentId: string;
  userId: string;
  teamId: string;
  tmbId: string;
  updateTime: Date;
  avatar: string;
  name: string;
  vectorModel: string;
  tags: string[];
  type: `${DatasetTypeEnum}`;
  permission: `${PermissionTypeEnum}`;
};

export type DatasetCollectionSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
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
  teamId: string;
  tmbId: string;
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

export type DatasetDataSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  datasetId: string;
  collectionId: string;
  q: string; // large chunks or question
  a: string; // answer or custom content
  indexes: {
    type: `${DatasetDataIndexTypeEnum}`;
    dataId: string; // pg data id
    text: string;
  }[];
};

export type CollectionWithDatasetType = Omit<DatasetCollectionSchemaType, 'datasetId'> & {
  datasetId: DatasetSchemaType;
};

/* ================= dataset ===================== */

/* ================= collection ===================== */
export type DatasetCollectionItemType = DatasetCollectionSchemaType & {
  canWrite: boolean;
};

/* ================= data ===================== */
export type PgRawDataItemType = {
  id: string;
  data_id: string;
  team_id: string;
};
export type PgDataItemType = {
  id: string;
  q: string;
  a: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
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

/* --------------- file ---------------------- */
export type DatasetFileSchema = {
  _id: string;
  length: number;
  chunkSize: number;
  uploadDate: Date;
  filename: string;
  contentType: string;
  metadata: {
    contentType: string;
    datasetId: string;
    teamId: string;
    tmbId: string;
  };
};

/* ============= search =============== */
export type SearchDataResultItemType = PgRawDataItemType & {
  score: number;
};
export type SearchDataResponseItemType = DatasetDataItemType & {
  score: number;
};
