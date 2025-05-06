import type { LLMModelItemType, EmbeddingModelItemType } from '../../core/ai/model.d';
import { PermissionTypeEnum } from '../../support/permission/constant';
import { PushDatasetDataChunkProps } from './api';
import type {
  DataChunkSplitModeEnum,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetTypeEnum,
  SearchScoreTypeEnum,
  TrainingModeEnum
} from './constants';
import type { DatasetPermission } from '../../support/permission/dataset/controller';
import { Permission } from '../../support/permission/controller';
import type { APIFileServer, FeishuServer, YuqueServer } from './apiDataset';
import type { SourceMemberType } from 'support/user/type';
import type { DatasetDataIndexTypeEnum } from './data/constants';
import type { ChunkSettingModeEnum } from './constants';

export type ChunkSettingsType = {
  trainingType: DatasetCollectionDataProcessModeEnum;
  autoIndexes?: boolean;
  imageIndex?: boolean;

  chunkSettingMode?: ChunkSettingModeEnum;
  chunkSplitMode?: DataChunkSplitModeEnum;

  chunkSize?: number;
  indexSize?: number;
  chunkSplitter?: string;
  qaPrompt?: string;
};

export type DatasetSchemaType = {
  _id: string;
  parentId?: string;
  userId: string;
  teamId: string;
  tmbId: string;
  updateTime: Date;

  avatar: string;
  name: string;
  intro: string;
  type: `${DatasetTypeEnum}`;

  vectorModel: string;
  agentModel: string;
  vlmModel?: string;

  websiteConfig?: {
    url: string;
    selector: string;
  };

  chunkSettings?: ChunkSettingsType;

  inheritPermission: boolean;
  apiServer?: APIFileServer;
  feishuServer?: FeishuServer;
  yuqueServer?: YuqueServer;

  // abandon
  autoSync?: boolean;
  externalReadUrl?: string;
  defaultPermission?: number;
};

export type DatasetCollectionSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
  parentId?: string;
  name: string;
  type: DatasetCollectionTypeEnum;
  tags?: string[];

  createTime: Date;
  updateTime: Date;

  // Status
  forbid?: boolean;
  nextSyncTime?: Date;

  // Collection metadata
  fileId?: string; // local file id
  rawLink?: string; // link url
  externalFileId?: string; //external file id
  apiFileId?: string; // api file id
  externalFileUrl?: string; // external import url

  rawTextLength?: number;
  hashRawText?: string;
  metadata?: {
    webPageSelector?: string;
    relatedImgId?: string; // The id of the associated image collections

    [key: string]: any;
  };

  // Parse settings
  customPdfParse?: boolean;
  // Chunk settings
  autoIndexes?: boolean;
  imageIndex?: boolean;
  trainingType: DatasetCollectionDataProcessModeEnum;

  chunkSettingMode?: ChunkSettingModeEnum;
  chunkSplitMode?: DataChunkSplitModeEnum;

  chunkSize?: number;
  indexSize?: number;
  chunkSplitter?: string;
  qaPrompt?: string;
};

export type DatasetCollectionTagsSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  tag: string;
};

export type DatasetDataIndexItemType = {
  type: `${DatasetDataIndexTypeEnum}`;
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
  chunkIndex: number;
  updateTime: Date;
  q: string; // large chunks or question
  a: string; // answer or custom content
  history?: {
    q: string;
    a: string;
    updateTime: Date;
  }[];
  forbid?: boolean;
  fullTextToken: string;
  indexes: DatasetDataIndexItemType[];
  rebuilding?: boolean;
};

export type DatasetDataTextSchemaType = {
  _id: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  dataId: string;
  fullTextToken: string;
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
  retryCount: number;
  errorMsg?: string;
};

export type CollectionWithDatasetType = DatasetCollectionSchemaType & {
  dataset: DatasetSchemaType;
};

/* ================= dataset ===================== */
export type DatasetSimpleItemType = {
  _id: string;
  avatar: string;
  name: string;
  vectorModel: EmbeddingModelItemType;
};
export type DatasetListItemType = {
  _id: string;
  tmbId: string;
  avatar: string;
  updateTime: Date;
  name: string;
  intro: string;
  type: `${DatasetTypeEnum}`;
  permission: DatasetPermission;
  vectorModel: EmbeddingModelItemType;
  inheritPermission: boolean;
  private?: boolean;
  sourceMember?: SourceMemberType;
};

export type DatasetItemType = Omit<DatasetSchemaType, 'vectorModel' | 'agentModel' | 'vlmModel'> & {
  status: `${DatasetStatusEnum}`;
  errorMsg?: string;
  vectorModel: EmbeddingModelItemType;
  agentModel: LLMModelItemType;
  vlmModel?: LLMModelItemType;
  permission: DatasetPermission;
};

/* ================= tag ===================== */
export type DatasetTagType = {
  _id: string;
  tag: string;
};

export type TagUsageType = {
  tagId: string;
  collections: string[];
};

/* ================= collection ===================== */
export type DatasetCollectionItemType = CollectionWithDatasetType & {
  sourceName: string;
  sourceId?: string;
  file?: DatasetFileSchema;
  permission: DatasetPermission;
  indexAmount: number;
  errorCount?: number;
};

/* ================= data ===================== */
export type DatasetDataItemType = {
  id: string;
  teamId: string;
  datasetId: string;
  updateTime: Date;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string;
  chunkIndex: number;
  indexes: DatasetDataIndexItemType[];
  isOwner: boolean;
  // permission: DatasetPermission;
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
    tmbId?: string;
    uid: string;
    encoding?: string;
  };
};

/* ============= search =============== */
export type SearchDataResponseItemType = Omit<
  DatasetDataItemType,
  'teamId' | 'indexes' | 'isOwner'
> & {
  score: { type: `${SearchScoreTypeEnum}`; value: number; index: number }[];
  // score: number;
};
