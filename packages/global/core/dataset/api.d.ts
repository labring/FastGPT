import { DatasetDataIndexItemType, DatasetSchemaType } from './type';
import { TrainingModeEnum, DatasetCollectionTypeEnum } from './constants';
import type { LLMModelItemType } from '../ai/model.d';

/* ================= dataset ===================== */
export type DatasetUpdateBody = {
  id: string;
  parentId?: string;
  name?: string;
  avatar?: string;
  intro?: string;
  permission?: DatasetSchemaType['permission'];
  agentModel?: LLMModelItemType;
  websiteConfig?: DatasetSchemaType['websiteConfig'];
  status?: DatasetSchemaType['status'];
};

/* ================= collection ===================== */
export type DatasetCollectionChunkMetadataType = {
  parentId?: string;
  trainingType?: `${TrainingModeEnum}`;
  chunkSize?: number;
  chunkSplitter?: string;
  qaPrompt?: string;
  metadata?: Record<string, any>;
};
export type CreateDatasetCollectionParams = DatasetCollectionChunkMetadataType & {
  datasetId: string;
  name: string;
  type: `${DatasetCollectionTypeEnum}`;
  fileId?: string;
  rawLink?: string;
  rawTextLength?: number;
  hashRawText?: string;
};

export type ApiCreateDatasetCollectionParams = DatasetCollectionChunkMetadataType & {
  datasetId: string;
};
export type TextCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  name: string;
  text: string;
};
export type LinkCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  link: string;
};
export type FileCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  name: string;
  rawTextLength: number;
  hashRawText: string;

  fileMetadata?: Record<string, any>;
  collectionMetadata?: Record<string, any>;
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
  trainingMode: `${TrainingModeEnum}`;
  prompt?: string;
  billId?: string;
};
export type PushDatasetDataResponse = {
  insertLen: number;
};
