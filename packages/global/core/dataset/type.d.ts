import { PermissionValueType } from 'support/permission/type';
import type { LLMModelItemType, VectorModelItemType } from '../../core/ai/model.d';
import { PermissionTypeEnum } from '../../support/permission/constant';
import { PushDatasetDataChunkProps } from './api';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetTypeEnum,
  SearchScoreTypeEnum,
  TrainingModeEnum
} from './constants';
import { DatasetPermission } from '../../support/permission/dataset/controller';
import { Permission } from '../../support/permission/controller';

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
  intro: string;
  type: DatasetTypeEnum;
  status: `${DatasetStatusEnum}`;
  permission: DatasetPermission;

  // metadata
  websiteConfig?: {
    url: string;
    selector: string;
  };
  externalReadUrl?: string;
  defaultPermission: PermissionValueType;
};

export type DatasetCollectionSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  parentId?: string;
  name: string;
  type: DatasetCollectionTypeEnum;
  createTime: Date;
  updateTime: Date;

  trainingType: TrainingModeEnum;
  chunkSize: number;
  chunkSplitter?: string;
  qaPrompt?: string;

  tags?: string[];

  fileId?: string; // local file id
  rawLink?: string; // link url
  externalFileId?: string; //external file id

  rawTextLength?: number;
  hashRawText?: string;
  externalFileUrl?: string; // external import url
  metadata?: {
    webPageSelector?: string;
    relatedImgId?: string; // The id of the associated image collections

    [key: string]: any;
  };
};

export type DatasetDataIndexItemType = {
  defaultIndex: boolean;
  dataId: string; // pg data id
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
  chunkIndex: number;
  updateTime: Date;
  q: string; // large chunks or question
  a: string; // answer or custom content
  fullTextToken: string;
  indexes: DatasetDataIndexItemType[];
  rebuilding?: boolean;
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
  mode: TrainingModeEnum;
  model: string;
  prompt: string;
  dataId?: string;
  q: string;
  a: string;
  chunkIndex: number;
  weight: number;
  indexes: Omit<DatasetDataIndexItemType, 'dataId'>[];
};

export type CollectionWithDatasetType = Omit<DatasetCollectionSchemaType, 'datasetId'> & {
  datasetId: DatasetSchemaType;
};
export type DatasetDataWithCollectionType = Omit<DatasetDataSchemaType, 'collectionId'> & {
  collectionId: DatasetCollectionSchemaType;
};

/* ================= dataset ===================== */
export type DatasetSimpleItemType = {
  _id: string;
  avatar: string;
  name: string;
  vectorModel: VectorModelItemType;
};
export type DatasetListItemType = {
  _id: string;
  parentId: string;
  avatar: string;
  name: string;
  intro: string;
  type: DatasetTypeEnum;
  permission: DatasetPermission;
  vectorModel: VectorModelItemType;
  defaultPermission: PermissionValueType;
};

export type DatasetItemType = Omit<DatasetSchemaType, 'vectorModel' | 'agentModel'> & {
  vectorModel: VectorModelItemType;
  agentModel: LLMModelItemType;
};

/* ================= collection ===================== */
export type DatasetCollectionItemType = CollectionWithDatasetType & {
  sourceName: string;
  sourceId?: string;
  file?: DatasetFileSchema;
  permission: DatasetPermission;
};

/* ================= data ===================== */
export type DatasetDataItemType = {
  id: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string;
  chunkIndex: number;
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
    teamId: string;
    tmbId: string;
    encoding?: string;
  };
};

/* ============= search =============== */
export type SearchDataResponseItemType = Omit<
  DatasetDataItemType,
  'teamId' | 'indexes' | 'isOwner' | 'canWrite'
> & {
  score: { type: `${SearchScoreTypeEnum}`; value: number; index: number }[];
  // score: number;
};
