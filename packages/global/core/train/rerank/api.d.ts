import type { PaginationProps, PaginationResponse } from '../../common/fetch/type';
import type {
  RerankTrainsetSchemaType,
  RerankTrainsetDataSchemaType,
  RerankTrainTaskSchemaType
} from './type';
import type { TrainDataSourceEnum, RerankTrainTaskStatusEnum } from './constants';

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
  appId: string; // Required: Associated app (supports 1:N relationship)
  name?: string; // Optional, default: `${appName} - Training Set`
  description?: string;
};
export type CreateRerankTrainsetResponse = RerankTrainsetSchemaType;

// Get Trainset Detail
export type RerankTrainsetDetailRequest = TrainsetIdQuery;
export type RerankTrainsetDetailResponse = RerankTrainsetSchemaType & {
  app: {
    _id: string;
    name: string;
    avatar: string;
  };
};

// List Trainsets
export type ListRerankTrainsetsRequest = PaginationProps<
  {
    appId?: string;
    status?: string;
  } & SortParams<'createTime' | 'updateTime' | 'name'>
>;
export type ListRerankTrainsetsResponse = PaginationResponse<
  RerankTrainsetSchemaType & {
    appName: string;
    appAvatar: string;
  }
>;

// Delete Trainset
export type DeleteRerankTrainsetRequest = TrainsetIdQuery;
export type DeleteRerankTrainsetResponse = MessageResponse;

// ===== Training Data API =====

// Generate Training Data (from dataset chunks)
export type GenerateRerankTrainDataRequest = {
  trainsetId: string; // Required: Target trainset ID
  datasetIds?: string[]; // Optional: Specific datasets, default uses all app-associated datasets
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

// Create Training Task with new trainset
export type CreateRerankTrainTaskWithTrainsetRequest = {
  appId: string;
  name?: string;
  pollingConfig?: {
    maxAttempts?: number; // Max polling attempts, default 60
    interval?: number; // Polling interval (ms), default 5000
  };
};

// Create Training Task
export type CreateRerankTrainTaskRequest = {
  appId: string;
  trainsetId: string; // Required: Trainset ID to use for training
  name?: string;
};
export type CreateRerankTrainTaskResponse = {
  taskId: string;
  status: `${RerankTrainTaskStatusEnum}`;
};

// Get Task Detail
export type RerankTrainTaskDetailRequest = TaskIdQuery;
export type RerankTrainTaskDetailResponse = RerankTrainTaskSchemaType & {
  appName: string;
  appAvatar: string;
  creatorName?: string;
  creatorAvatar?: string;
};

// List Training Tasks
export type ListRerankTrainTasksRequest = PaginationProps<
  {
    appId?: string;
    status?: `${RerankTrainTaskStatusEnum}`;
  } & SortParams<'createTime' | 'updateTime' | 'finishTime'>
>;

export type RerankTrainTaskListItem = RerankTrainTaskSchemaType & {
  appName: string;
  appAvatar: string;
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
