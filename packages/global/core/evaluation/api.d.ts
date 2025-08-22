import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  CreateEvaluationParams,
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  CreateMetricParams,
  EvaluationMetricSchemaType,
  MetricResult,
  ImportResult,
  EvalCase,
  EvaluationDisplayType,
  EvaluationItemDisplayType
} from './type';

// ===== Common Types =====
export type MessageResponse = { message: string };

export type EvalIdQuery = { evalId: string };
export type EvalItemIdQuery = { evalItemId: string };
export type MetricIdQuery = { metricId: string };

// ===== Evaluation Task API =====

// Create Evaluation
export type CreateEvaluationRequest = CreateEvaluationParams;
export type CreateEvaluationResponse = EvaluationSchemaType;

// Update Evaluation
export type UpdateEvaluationRequest = EvalIdQuery & Partial<CreateEvaluationParams>;
export type UpdateEvaluationResponse = MessageResponse;

// Get Evaluation Detail
export type EvaluationDetailRequest = EvalIdQuery;
export type EvaluationDetailResponse = EvaluationSchemaType;

// Delete Evaluation
export type DeleteEvaluationRequest = EvalIdQuery;
export type DeleteEvaluationResponse = MessageResponse;

// List Evaluations
export type ListEvaluationsRequest = PaginationProps<{
  searchKey?: string;
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
  avgScore?: number;
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

// List Evaluation Items
export type ListEvaluationItemsRequest = PaginationProps<EvalIdQuery>;
export type ListEvaluationItemsResponse = PaginationResponse<EvaluationItemDisplayType>;

// Get Evaluation Item Detail
export type EvaluationItemDetailRequest = EvalItemIdQuery;
export type EvaluationItemDetailResponse = {
  item: EvaluationItemSchemaType;
  dataItem: any;
  response?: string;
  result?: any;
  score?: number;
};

// Update Evaluation Item
export type UpdateEvaluationItemRequest = EvalItemIdQuery & {
  userInput?: string;
  expectedOutput?: string;
  variables?: Record<string, any>;
};
export type UpdateEvaluationItemResponse = MessageResponse;

// Retry Evaluation Item
export type RetryEvaluationItemRequest = EvalItemIdQuery;
export type RetryEvaluationItemResponse = MessageResponse;

// Delete Evaluation Item
export type DeleteEvaluationItemRequest = EvalItemIdQuery;
export type DeleteEvaluationItemResponse = MessageResponse;

// ===== Evaluation Metric API =====

// Create Metric
export type CreateMetricRequest = CreateMetricParams;
export type CreateMetricResponse = EvaluationMetricSchemaType;

// Get Metric Detail
export type MetricDetailRequest = MetricIdQuery;
export type MetricDetailResponse = EvaluationMetricSchemaType;

// Update Metric
export type UpdateMetricRequest = MetricIdQuery & Partial<CreateMetricParams>;
export type UpdateMetricResponse = MessageResponse;

// Delete Metric
export type DeleteMetricRequest = MetricIdQuery;
export type DeleteMetricResponse = MessageResponse;

// List Metrics
export type ListMetricsRequest = PaginationProps<{
  searchKey?: string;
}>;
export type ListMetricsResponse = PaginationResponse<EvaluationMetricSchemaType>;

// Test Metric
export type TestMetricRequest = MetricIdQuery & {
  testCase: EvalCase;
};
export type TestMetricResponse = MetricResult;
