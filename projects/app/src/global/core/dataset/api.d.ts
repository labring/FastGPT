import { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api';
import {
  DatasetSearchModeEnum,
  DatasetTypeEnum,
  ImportDataSourceEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetDataIndexItemType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

/* ================= dataset ===================== */
export type CreateDatasetParams = {
  parentId?: string;
  type: `${DatasetTypeEnum}`;
  name: string;
  intro: string;
  avatar: string;
  vectorModel?: string;
  agentModel?: string;
};

/* ================= collection ===================== */

/* ================= data ===================== */
export type InsertOneDatasetDataProps = PushDatasetDataChunkProps & {
  collectionId: string;
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
  [NodeInputKeyEnum.datasetSimilarity]?: number;
  [NodeInputKeyEnum.datasetMaxTokens]?: number;
  [NodeInputKeyEnum.datasetSearchMode]?: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
};
export type SearchTestResponse = {
  list: SearchDataResponseItemType[];
  duration: string;
  limit: number;
  searchMode: `${DatasetSearchModeEnum}`;
  usingReRank: boolean;
  similarity: number;
  usingQueryExtension: boolean;
};

/* =========== training =========== */
export type PostPreviewFilesChunksProps = {
  type: `${ImportDataSourceEnum}`;
  sourceId: string;
  chunkSize: number;
  overlapRatio: number;
  customSplitChar?: string;
};

export type PostPreviewFilesChunksResponse = {
  fileId: string;
  rawTextLength: number;
  chunks: string[];
}[];
export type PostPreviewTableChunksResponse = {
  fileId: string;
  totalChunks: number;
  chunks: { q: string; a: string; chunkIndex: number }[];
  errorText?: string;
}[];
