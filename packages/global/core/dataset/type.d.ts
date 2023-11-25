import type { LLMModelItemType, VectorModelItemType } from '../../core/ai/model.d';
import { PermissionTypeEnum } from '../../support/permission/constant';
import { PushDatasetDataChunkProps } from './api';
import {
  DatasetCollectionTypeEnum,
  DatasetDataIndexTypeEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from './constant';

/* schema */
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
  agentModel: string;
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

export type DatasetDataIndexItemType = {
  defaultIndex: boolean;
  dataId: string; // pg data id
  type: `${DatasetDataIndexTypeEnum}`;
  text: string;
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
  fullTextToken: string;
  indexes: DatasetDataIndexItemType[];
};

export type DatasetTrainingSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId: string;
  expireAt: Date;
  lockTime: Date;
  mode: `${TrainingModeEnum}`;
  model: string;
  prompt: string;
  q: string;
  a: string;
  indexes: Omit<DatasetDataIndexItemType, 'dataId'>[];
};

export type CollectionWithDatasetType = Omit<DatasetCollectionSchemaType, 'datasetId'> & {
  datasetId: DatasetSchemaType;
};
export type DatasetDataWithCollectionType = Omit<DatasetDataSchemaType, 'collectionId'> & {
  collectionId: DatasetCollectionSchemaType;
};

/* ================= dataset ===================== */
export type DatasetItemType = Omit<DatasetSchemaType, 'vectorModel' | 'agentModel'> & {
  vectorModel: VectorModelItemType;
  agentModel: LLMModelItemType;
  isOwner: boolean;
  canWrite: boolean;
};

/* ================= collection ===================== */
export type DatasetCollectionItemType = CollectionWithDatasetType & {
  canWrite: boolean;
  sourceName: string;
  sourceId?: string;
};

/* ================= data ===================== */
export type DatasetDataItemType = {
  id: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string;
  indexes: DatasetDataIndexItemType[];
  isOwner: boolean;
  canWrite: boolean;
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
export type SearchDataResponseItemType = Omit<DatasetDataItemType, 'isOwner' | 'canWrite'> & {
  score: number;
};
