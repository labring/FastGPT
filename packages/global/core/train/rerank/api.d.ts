import type { PaginationProps, PaginationResponse } from '../../common/fetch/type';
import type {
  RerankTrainsetSchemaType,
  RerankTrainsetDataSchemaType,
  RerankTrainTaskSchemaType
} from './type';
import type {
  TrainDataSourceEnum,
  RerankTrainTaskStatusEnum,
  RerankTrainTypeEnum
} from './constants';

// ===== Common Types =====
export type MessageResponse = { message: string };
export type TrainsetIdQuery = { trainsetId: string };
export type TaskIdQuery = { taskId: string };
export type DataIdQuery = { dataId: string };

/** Sort order */
export type SortOrder = 'asc' | 'desc';

/** Sort parameters */
export type SortParams<T extends string> = {
  sortField?: T;
  sortOrder?: SortOrder;
};

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
export type CreateRerankTrainDataResponse = MessageResponse;

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
    source?: `${TrainDataSourceEnum}`;
  } & SortParams<'createTime' | 'updateTime'>
>;
export type ListRerankTrainDataResponse = PaginationResponse<RerankTrainsetDataSchemaType>;

// Delete Training Data
export type DeleteRerankTrainDataRequest = {
  dataIds: string[];
};
export type DeleteRerankTrainDataResponse = MessageResponse;

// ===== Training Task API =====

// Create Training Task (supports exact mode and auto mode)
export type CreateRerankTrainTaskRequest = {
  // Exact mode: pass trainsetId + evalDatasetId
  // Auto mode: pass datasetIds (generate_trainset/generate_evaldataset stages auto-generate)
  // Validation rule: (trainsetId && evalDatasetId) || datasetIds, otherwise missingParams
  trainsetId?: string; // Exact mode: existing trainset ID (must be ready, teamId must match)
  evalDatasetId?: string; // Exact mode: existing eval dataset ID
  datasetIds?: string[]; // Auto mode: knowledge base ID list

  baseModelId: string; // Base model ID (BaseModelItemType.model), replaces appId
  newModelName?: string; // Optional name for the trained model
  name?: string;
  trainType?: `${RerankTrainTypeEnum}`; // Training type: lora or ptuning, defaults to lora
};
export type CreateRerankTrainTaskResponse = {
  taskId: string;
  status: `${RerankTrainTaskStatusEnum}`;
};

// Get Task Detail
export type RerankTrainTaskDetailRequest = TaskIdQuery;
export type RerankTrainTaskDetailResponse = RerankTrainTaskSchemaType & {
  creatorName?: string;
  creatorAvatar?: string;
};

// List Training Tasks
export type ListRerankTrainTasksRequest = PaginationProps<
  {
    baseModelId?: string; // Filter by base model (replaces appId)
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

// Apply Training Task Results (manually apply tuned model from a completed task)
export type ApplyRerankTrainTaskRequest = {
  taskId: string; // Training task ID (status must be completed)
};
export type ApplyRerankTrainTaskResponse = {
  tunedModelId: string;
  bestModelId?: string; // The previously active model that was replaced (if any)
  updatedAppsCount: number;
};
