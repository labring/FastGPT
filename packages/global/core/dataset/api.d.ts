import { DatasetDataIndexItemType, DatasetSchemaType } from './type';
import { TrainingModeEnum, DatasetCollectionTypeEnum } from './constant';
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
  trainingType?: `${TrainingModeEnum}`;
  chunkSize?: number;
  chunkSplitter?: string;
  qaPrompt?: string;
};
export type CreateDatasetCollectionParams = DatasetCollectionChunkMetadataType & {
  datasetId: string;
  parentId?: string;
  name: string;
  type: `${DatasetCollectionTypeEnum}`;
  fileId?: string;
  rawLink?: string;
  rawTextLength?: number;
  hashRawText?: string;
  metadata?: Record<string, any>;
};

export type ApiCreateDatasetCollectionParams = DatasetCollectionChunkMetadataType & {
  datasetId: string;
  parentId?: string;
  metadata?: Record<string, any>;
};
export type TextCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  name: string;
  text: string;
};
export type LinkCreateDatasetCollectionParams = ApiCreateDatasetCollectionParams & {
  link: string;
  chunkSplitter?: string;
};

/* ================= data ===================== */
export type PgSearchRawType = {
  id: string;
  team_id: string;
  tmb_id: string;
  collection_id: string;
  data_id: string;
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
