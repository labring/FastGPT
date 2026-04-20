import type { PaginationProps, PaginationResponse } from '../../openapi/api';
import type {
  EmbeddingTrainsetSchemaType,
  EmbeddingTrainsetDataSchemaType,
  EmbeddingTrainTaskSchemaType
} from './type';
import type {
  EmbeddingTrainDataSourceEnum,
  EmbeddingTrainTaskStatusEnum,
  EmbeddingTrainTypeEnum
} from './constants';
import type {
  MessageResponse,
  TrainsetIdQuery,
  TaskIdQuery,
  DataIdQuery,
  SortParams
} from '../common/api';

// ===== Trainset API =====

// Create Trainset
export type CreateEmbeddingTrainsetRequest = {
  name?: string;
  description?: string;
};
export type CreateEmbeddingTrainsetResponse = EmbeddingTrainsetSchemaType;

// Get Trainset Detail
export type EmbeddingTrainsetDetailRequest = TrainsetIdQuery;
export type EmbeddingTrainsetDetailResponse = EmbeddingTrainsetSchemaType;

// List Trainsets
export type ListEmbeddingTrainsetsRequest = PaginationProps<
  {
    status?: string;
  } & SortParams<'createTime' | 'updateTime' | 'name'>
>;
export type ListEmbeddingTrainsetsResponse = PaginationResponse<EmbeddingTrainsetSchemaType>;

// Delete Trainset
export type DeleteEmbeddingTrainsetRequest = TrainsetIdQuery;
export type DeleteEmbeddingTrainsetResponse = MessageResponse;

// ===== Training Data API =====

// Generate Training Data (from dataset chunks)
export type GenerateEmbeddingTrainDataRequest = {
  trainsetId: string; // Required: Target trainset ID
  datasetIds: string[]; // Required: Knowledge base IDs to generate data from
  generateConfig?: {
    /** FastGPT internal parameters */
    sampleSize?: number; // Sample size per dataset, default uses 80% of all dataset chunks
    forceRegenerate?: boolean; // Whether to force regeneration
    /** DiTing API parameters (defaults handled by DiTing server) */
    minNegativeSamples?: number; // Min negative samples per sample, default 1
    maxNegativeSamples?: number; // Max negative samples per sample, default 7
    includeOriginalQ?: boolean; // Whether to include original question, default true
  };
};
export type GenerateEmbeddingTrainDataResponse = {
  jobId: string;
  status: 'pending';
};

// Create Training Data (manual)
export type CreateEmbeddingTrainDataRequest = {
  trainsetId: string; // Required: Target trainset ID
  query: string; // Single query
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string; // Reason for addition
};
export type CreateEmbeddingTrainDataResponse = EmbeddingTrainsetDataSchemaType;

// Update Training Data
export type UpdateEmbeddingTrainDataRequest = DataIdQuery & {
  query?: string; // Single query
  positiveDocs?: string[];
  negativeDocs?: string[];
};
export type UpdateEmbeddingTrainDataResponse = MessageResponse;

// List Training Data
export type ListEmbeddingTrainDataRequest = PaginationProps<
  {
    trainsetId: string; // Required: Trainset ID to query
    source?: `${EmbeddingTrainDataSourceEnum}`;
  } & SortParams<'createTime' | 'updateTime'>
>;
export type ListEmbeddingTrainDataResponse = PaginationResponse<EmbeddingTrainsetDataSchemaType>;

// Delete Training Data
export type DeleteEmbeddingTrainDataRequest = {
  dataIds: string[];
};
export type DeleteEmbeddingTrainDataResponse = MessageResponse;

// ===== Training Task API =====

// Create Training Task
// datasetIds is ALWAYS required (even when trainsetId or evalDatasetId are provided):
//   - eval-dataset generation stage reads datasetIds to sample eval data
//   - eval stages call dispatchDatasetSearch against datasetIds to produce ranked results
//   - trainsetId present  → skip trainset generation stage only; datasetIds still needed for eval
//   - evalDatasetId present → skip eval-dataset generation stage only; datasetIds still needed for eval search
export type CreateEmbeddingTrainTaskRequest = {
  datasetIds: string[]; // Required in all modes: knowledge base IDs used across generation and evaluation stages
  trainsetId?: string; // Optional: if present, skip trainset generation stage
  evalDatasetId?: string; // Optional: if present, skip eval dataset generation stage

  baseModelId: string; // Base model ID (BaseModelItemType.model)
  newModelName?: string; // Optional name for the trained model
  name?: string;
  trainType?: `${EmbeddingTrainTypeEnum}`; // Training type: lora or ptuning, defaults to lora
};
export type CreateEmbeddingTrainTaskResponse = EmbeddingTrainTaskSchemaType;

// Get Task Detail
export type EmbeddingTrainTaskDetailRequest = TaskIdQuery;
export type EmbeddingTrainTaskDetailResponse = EmbeddingTrainTaskSchemaType & {
  creatorName?: string;
  creatorAvatar?: string;
};

// List Training Tasks
export type ListEmbeddingTrainTasksRequest = PaginationProps<
  {
    baseModelId?: string; // Filter by base model
    tunedModelId?: string; // Filter by produced tuned model (triggers chain traversal)
    status?: `${EmbeddingTrainTaskStatusEnum}`;
  } & SortParams<'createTime' | 'updateTime' | 'finishTime'>
>;

export type EmbeddingTrainTaskListItem = EmbeddingTrainTaskSchemaType & {
  creatorName?: string;
  creatorAvatar?: string;
};
export type ListEmbeddingTrainTasksResponse = PaginationResponse<EmbeddingTrainTaskListItem>;

// Retry Training Task
export type RetryEmbeddingTrainTaskRequest = TaskIdQuery;
export type RetryEmbeddingTrainTaskResponse = {
  success: true;
  jobId: string;
};

// Cancel Training Task
export type CancelEmbeddingTrainTaskRequest = TaskIdQuery;
export type CancelEmbeddingTrainTaskResponse = MessageResponse;

// Delete Training Task
export type DeleteEmbeddingTrainTaskRequest = TaskIdQuery & { force?: string };
export type DeleteEmbeddingTrainTaskResponse = MessageResponse;
