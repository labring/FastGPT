import { DatasetDataIndexItemType, DatasetSchemaType } from './type';
import { DatasetCollectionTrainingModeEnum, DatasetCollectionTypeEnum } from './constant';
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
export type CreateDatasetCollectionParams = {
  datasetId: string;
  parentId?: string;
  name: string;
  type: `${DatasetCollectionTypeEnum}`;
  trainingType?: `${DatasetCollectionTrainingModeEnum}`;
  chunkSize?: number;
  fileId?: string;
  rawLink?: string;
  qaPrompt?: string;
  hashRawText?: string;
  metadata?: Record<string, any>;
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
