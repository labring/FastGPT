import type { PaginationProps, PaginationResponse } from '../../openapi/api';
import type {
  RerankTrainsetSchemaType,
  RerankTrainsetDataSchemaType,
  RerankTrainTaskSchemaType
} from './type';
import type {
  RerankTrainDataSourceEnum,
  RerankTrainTaskStatusEnum,
  RerankTrainTypeEnum
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
export type CreateRerankTrainsetRequest = {
  name?: string;
  description?: string;
};
export type CreateRerankTrainsetResponse = RerankTrainsetSchemaType;

// Get Trainset Detail
export type RerankTrainsetDetailRequest = TrainsetIdQuery;
export type RerankTrainsetDetailResponse = RerankTrainsetSchemaType;

// List Trainsets
export type ListRerankTrainsetsRequest = PaginationProps<
  {
    status?: string;
  } & SortParams<'createTime' | 'updateTime' | 'name'>
>;
export type ListRerankTrainsetsResponse = PaginationResponse<RerankTrainsetSchemaType>;

// Delete Trainset
export type DeleteRerankTrainsetRequest = TrainsetIdQuery;
export type DeleteRerankTrainsetResponse = MessageResponse;

// ===== Training Data API =====

// Generate Training Data (from dataset chunks)
export type GenerateRerankTrainDataRequest = {
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
export type GenerateRerankTrainDataResponse = {
  jobId: string;
  status: 'pending';
};

// Create Training Data (manual)
export type CreateRerankTrainDataRequest = {
  trainsetId: string; // Required: Target trainset ID
  query: string; // Single query
  positiveDocs: string[];
  negativeDocs: string[];
  reason?: string; // Reason for addition
};
export type CreateRerankTrainDataResponse = RerankTrainsetDataSchemaType;

// Update Training Data
export type UpdateRerankTrainDataRequest = DataIdQuery & {
  query?: string; // Single query
  positiveDocs?: string[];
  negativeDocs?: string[];
};
export type UpdateRerankTrainDataResponse = MessageResponse;

// List Training Data
export type ListRerankTrainDataRequest = PaginationProps<
  {
    trainsetId: string; // Required: Trainset ID to query
    source?: `${RerankTrainDataSourceEnum}`;
  } & SortParams<'createTime' | 'updateTime'>
>;
export type ListRerankTrainDataResponse = PaginationResponse<RerankTrainsetDataSchemaType>;

// Delete Training Data
export type DeleteRerankTrainDataRequest = {
  dataIds: string[];
};
export type DeleteRerankTrainDataResponse = MessageResponse;

// ===== Training Task API =====

// Create Training Task
// datasetIds is ALWAYS required (even when trainsetId or evalDatasetId are provided):
//   - trainset generation stage reads datasetIds to sample training data
//   - eval-dataset generation stage reads datasetIds to sample eval data
//   - trainsetId present  → skip trainset generation stage only; datasetIds still needed for eval
//   - evalDatasetId present → skip eval-dataset generation stage only; datasetIds still needed for task record integrity
export type CreateRerankTrainTaskRequest = {
  datasetIds: string[]; // Required in all modes: knowledge base IDs used across generation and evaluation stages
  trainsetId?: string; // Optional: if present, skip trainset generation stage
  evalDatasetId?: string; // Optional: if present, skip eval dataset generation stage

  baseModelId: string; // Base model ID (BaseModelItemType.model)
  newModelName?: string; // Optional name for the trained model
  name?: string;
  trainType?: `${RerankTrainTypeEnum}`; // Training type: lora or ptuning, defaults to lora
};
export type CreateRerankTrainTaskResponse = RerankTrainTaskSchemaType;

// Get Task Detail
export type RerankTrainTaskDetailRequest = TaskIdQuery;
export type RerankTrainTaskDetailResponse = RerankTrainTaskSchemaType & {
  creatorName?: string;
  creatorAvatar?: string;
};

// List Training Tasks
export type ListRerankTrainTasksRequest = PaginationProps<
  {
    baseModelId?: string; // Filter by base model
    tunedModelId?: string; // Filter by produced tuned model (triggers chain traversal)
    status?: `${RerankTrainTaskStatusEnum}`;
  } & SortParams<'createTime' | 'updateTime' | 'finishTime'>
>;

export type RerankTrainTaskListItem = RerankTrainTaskSchemaType & {
  creatorName?: string;
  creatorAvatar?: string;
};
export type ListRerankTrainTasksResponse = PaginationResponse<RerankTrainTaskListItem>;

// Retry Training Task
export type RetryRerankTrainTaskRequest = TaskIdQuery;
export type RetryRerankTrainTaskResponse = {
  success: true;
  jobId: string;
};

// Cancel Training Task
export type CancelRerankTrainTaskRequest = TaskIdQuery;
export type CancelRerankTrainTaskResponse = MessageResponse;

// Delete Training Task
export type DeleteRerankTrainTaskRequest = TaskIdQuery;
export type DeleteRerankTrainTaskResponse = MessageResponse;
