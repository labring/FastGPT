import type { PaginationProps, PaginationResponse } from '../../../web/common/fetch/type';
import type {
  CreateEvaluationParams,
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  EvaluationDisplayType,
  EvaluationItemDisplayType,
  EvaluationDataItemType,
  EvaluationStatistics
} from './type';

// ===== Common Types =====
export type MessageResponse = { message: string };

// ===== Evaluation Task API =====
export type EvalIdQuery = { evalId: string };
// Create Evaluation
export type CreateEvaluationRequest = CreateEvaluationParams;
export type CreateEvaluationResponse = EvaluationSchemaType;

// Update Evaluation
export type UpdateEvaluationRequest = EvalIdQuery & Partial<CreateEvaluationParams>;
export type UpdateEvaluationResponse = MessageResponse;

// Get Evaluation Detail
export type EvaluationDetailRequest = EvalIdQuery;
export type EvaluationDetailResponse = EvaluationDisplayType;

// Delete Evaluation
export type DeleteEvaluationRequest = EvalIdQuery;
export type DeleteEvaluationResponse = MessageResponse;

// List Evaluations
export type ListEvaluationsRequest = PaginationProps<{
  searchKey?: string;
  appName?: string;
  appId?: string;
}>;
export type ListEvaluationsResponse = PaginationResponse<EvaluationDisplayType>;

// Start Evaluation
export type StartEvaluationRequest = EvalIdQuery;
export type StartEvaluationResponse = MessageResponse;

// Stop Evaluation
export type StopEvaluationRequest = EvalIdQuery;
export type StopEvaluationResponse = MessageResponse;

// Get Evaluation Stats
export type StatsEvaluationRequest = EvalIdQuery;
export type EvaluationStatsResponse = {
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
};

// Export Evaluation Items
export type ExportEvaluationItemsRequest = EvalIdQuery & {
  format?: string;
};

// Retry Failed Evaluation Items
export type RetryFailedEvaluationItemsRequest = EvalIdQuery;
export type RetryFailedItemsResponse = {
  message: string;
  retryCount: number;
};

// ===== Evaluation Item API =====

export type EvalItemIdQuery = { evalItemId: string };

// List Evaluation Items
export type ListEvaluationItemsRequest = PaginationProps<EvalIdQuery>;
export type ListEvaluationItemsResponse = PaginationResponse<EvaluationItemDisplayType>;

// Get Evaluation Item Detail
export type EvaluationItemDetailRequest = EvalItemIdQuery;
export type EvaluationItemDetailResponse = EvaluationItemSchemaType;

// Update Evaluation Item
export type UpdateEvaluationItemRequest = EvalItemIdQuery & Partial<EvaluationDataItemType>;
export type UpdateEvaluationItemResponse = MessageResponse;

// Retry Evaluation Item
export type RetryEvaluationItemRequest = EvalItemIdQuery;
export type RetryEvaluationItemResponse = MessageResponse;

// Delete Evaluation Item
export type DeleteEvaluationItemRequest = EvalItemIdQuery;
export type DeleteEvaluationItemResponse = MessageResponse;
