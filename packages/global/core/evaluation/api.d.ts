import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  CreateEvaluationParams,
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  CreateMetricParams,
  EvaluationMetricSchemaType,
  CreateDatasetParams,
  EvaluationDatasetSchemaType,
  UpdateDatasetParams,
  MetricResult,
  ImportResult,
  EvalCase,
  EvaluationDisplayType,
  EvaluationItemDisplayType
} from './type';

// ===== Common Utility Types =====
export type MessageResponse = { message: string };
export type IdQuery = { id: string };

// ===== Evaluation API Types =====

export type CreateEvaluationRequest = CreateEvaluationParams;
export type CreateEvaluationResponse = EvaluationSchemaType;

export type UpdateEvaluationRequest = Partial<CreateEvaluationParams>;
export type UpdateEvaluationResponse = MessageResponse;

export type EvaluationDetailResponse = EvaluationSchemaType;

export type DeleteEvaluationResponse = MessageResponse;

export type ListEvaluationsRequest = PaginationProps<{
  searchKey?: string;
}>;
export type ListEvaluationsResponse = PaginationResponse<EvaluationDisplayType>;

export type StartEvaluationRequest = {
  evaluationId: string;
};
export type StartEvaluationResponse = MessageResponse;

export type StopEvaluationRequest = {
  evaluationId: string;
};
export type StopEvaluationResponse = MessageResponse;

export type EvaluationStatsResponse = {
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
  avgScore?: number;
};

// ===== Evaluation Item API Types =====

export type ListEvaluationItemsRequest = PaginationProps<{
  evalId: string;
}>;
export type ListEvaluationItemsResponse = PaginationResponse<EvaluationItemDisplayType>;

export type UpdateEvaluationItemRequest = {
  evalItemId: string;
  userInput?: string;
  expectedOutput?: string;
  variables?: Record<string, any>;
};
export type UpdateEvaluationItemResponse = MessageResponse;

export type EvaluationItemDetailResponse = {
  item: EvaluationItemSchemaType;
  dataItem: any;
  response?: string;
  result?: any;
  score?: number;
};

export type RetryEvaluationItemRequest = {
  evalItemId: string;
};
export type RetryEvaluationItemResponse = MessageResponse;

export type DeleteEvaluationItemResponse = MessageResponse;

// ===== Metric API Types =====

export type CreateMetricRequest = CreateMetricParams;
export type CreateMetricResponse = EvaluationMetricSchemaType;

export type UpdateMetricRequest = Partial<CreateMetricParams>;
export type UpdateMetricResponse = MessageResponse;

export type MetricDetailResponse = EvaluationMetricSchemaType;

export type DeleteMetricResponse = MessageResponse;

export type ListMetricsRequest = PaginationProps<{
  searchKey?: string;
}>;
export type ListMetricsResponse = PaginationResponse<EvaluationMetricSchemaType>;

export type TestMetricRequest = {
  metricId: string;
  testCase: EvalCase;
};
export type TestMetricResponse = MetricResult;

// ===== Dataset API Types =====

export type CreateDatasetRequest = CreateDatasetParams;
export type CreateDatasetResponse = EvaluationDatasetSchemaType;

export type UpdateDatasetRequest = UpdateDatasetParams;
export type UpdateDatasetResponse = MessageResponse;

export type DatasetDetailResponse = EvaluationDatasetSchemaType;

export type DeleteDatasetResponse = MessageResponse;

export type ListDatasetsRequest = PaginationProps<{
  searchKey?: string;
}>;
export type ListDatasetsResponse = PaginationResponse<EvaluationDatasetSchemaType>;

export type ImportDatasetResponse = ImportResult;

// ===== Query Types =====

export type EvaluationDetailQuery = IdQuery;
export type UpdateEvaluationQuery = IdQuery;
export type DeleteEvaluationQuery = IdQuery;
export type MetricDetailQuery = IdQuery;
export type MetricUpdateQuery = IdQuery;
export type MetricDeleteQuery = IdQuery;
export type DatasetDetailQuery = IdQuery;
export type DatasetUpdateQuery = IdQuery;
export type DatasetDeleteQuery = IdQuery;
export type EvaluationItemDetailQuery = IdQuery;

export type EvaluationStatsQuery = {
  evaluationId: string;
};

export type DeleteEvaluationItemQuery = {
  evalItemId: string;
};

export type ExportEvaluationItemsQuery = {
  evaluationId: string;
  format?: string;
};
export type RetryFailedItemsBody = {
  evaluationId: string;
};

export type RetryFailedItemsResponse = {
  message: string;
  retryCount: number;
};
