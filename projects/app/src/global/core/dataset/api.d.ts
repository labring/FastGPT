import { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api';
import {
  DatasetSearchModeEnum,
  DatasetTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constant';
import {
  DatasetDataIndexItemType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';

/* ================= dataset ===================== */
export type CreateDatasetParams = {
  parentId?: string;
  type: `${DatasetTypeEnum}`;
  name: string;
  intro: string;
  avatar: string;
  vectorModel?: string;
  agentModel?: string;
  type: `${DatasetTypeEnum}`;
};

/* ================= collection ===================== */

/* ================= data ===================== */
export type InsertOneDatasetDataProps = PushDatasetDataChunkProps & {
  collectionId: string;
};
export type PushDatasetDataProps = {
  collectionId: string;
  data: PushDatasetDataChunkProps[];
  trainingMode: `${TrainingModeEnum}`;
  prompt?: string;
  billId?: string;
};
export type UpdateDatasetDataProps = {
  id: string;
  q?: string; // embedding content
  a?: string; // bonus content
  indexes: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    dataId?: string; // pg data id
  })[];
};

export type GetTrainingQueueProps = {
  vectorModel: string;
  agentModel: string;
};
export type GetTrainingQueueResponse = {
  vectorTrainingCount: number;
  agentTrainingCount: number;
};

/* -------------- search ---------------- */
export type SearchTestProps = {
  datasetId: string;
  text: string;
  limit?: number;
  searchMode?: `${DatasetSearchModeEnum}`;
  usingReRank: boolean;
  similarity?: number;
};
export type SearchTestResponse = {
  list: SearchDataResponseItemType[];
  duration: string;
  limit: number;
  searchMode: `${DatasetSearchModeEnum}`;
  usingReRank: boolean;
  similarity: number;
};
