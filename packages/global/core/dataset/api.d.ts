import { DatasetDataIndexItemType, DatasetSchemaType } from './type';
import { TrainingModeEnum, DatasetCollectionTypeEnum } from './constants';
import type { LLMModelItemType } from '../ai/model.d';
import { ParentIdType } from 'common/parentFolder/type';

/* ================= dataset ===================== */
export type DatasetUpdateBody = {
  id: string;
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  intro?: string;
  agentModel?: LLMModelItemType;
  status?: DatasetSchemaType['status'];

  websiteConfig?: DatasetSchemaType['websiteConfig'];
  externalReadUrl?: DatasetSchemaType['externalReadUrl'];
  defaultPermission?: DatasetSchemaType['defaultPermission'];
};

/* ================= collection ===================== */
export type DatasetCollectionChunkMetadataType = {
  parentId?: string;
  trainingType?: TrainingModeEnum;
  chunkSize?: number;
  chunkSplitter?: string;
  qaPrompt?: string;
  metadata?: Record<string, any>;
};

// create collection params
export type CreateDatasetCollectionParams = DatasetCollectionChunkMetadataType & {
  datasetId: string;
  name: string;
  type: DatasetCollectionTypeEnum;

  tags?: string[];

  fileId?: string;
  rawLink?: string;
  externalFileId?: string;

  externalFileUrl?: string;
  rawTextLength?: number;
  hashRawText?: string;
};

export type ApiCreateDatasetCollectionParams = DatasetCollectionChunkMetadataType & {
  datasetId: string;
  tags?: string[];
};
export type TextCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  name: string;
  text: string;
};
export type LinkCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  link: string;
};
export type FileIdCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  fileId: string;
};
export type FileCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  fileMetadata?: Record<string, any>;
  collectionMetadata?: Record<string, any>;
};
export type CsvTableCreateDatasetCollectionParams = {
  datasetId: string;
  parentId?: string;
  fileId: string;
};
export type ExternalFileCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  externalFileId?: string;
  externalFileUrl: string;
  filename?: string;
};

/* ================= tag ===================== */
export type CreateDatasetCollectionTagParams = {
  datasetId: string;
  tag: string;
};
export type AddTagsToCollectionsParams = {
  originCollectionIds: string[];
  collectionIds: string[];
  datasetId: string;
  tag: string;
};
export type UpdateDatasetCollectionTagParams = {
  datasetId: string;
  tagId: string;
  tag: string;
};

/* ================= data ===================== */
export type PgSearchRawType = {
  id: string;
  collection_id: string;
  score: number;
};
export type PushDatasetDataChunkProps = {
  q: string; // embedding content
  a?: string; // bonus content
  chunkIndex?: number;
  indexes?: Omit<DatasetDataIndexItemType, 'dataId'>[];
};

export type PostWebsiteSyncParams = {
  datasetId: string;
  billId: string;
};

export type PushDatasetDataProps = {
  collectionId: string;
  data: PushDatasetDataChunkProps[];
  trainingMode: TrainingModeEnum;
  prompt?: string;
  billId?: string;
};
export type PushDatasetDataResponse = {
  insertLen: number;
};
