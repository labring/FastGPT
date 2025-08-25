import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  CreateEvaluationParams,
  EvaluationSchemaType,
  EvalItemSchemaType,
  CreateMetricParams,
  EvalMetricSchemaType,
  CreateDatasetParams,
  EvalDatasetSchemaType,
  UpdateDatasetParams,
  MetricResult,
  ImportResult,
  EvalCase
} from './type';

// ===== Common Utility Types =====
export type MessageResponse = { message: string };
export type IdQuery = { id: string };

// ===== Evaluation API Types =====

export type CreateEvaluationBody = CreateEvaluationParams;
export type CreateEvaluationResponse = EvaluationSchemaType;

export type UpdateEvaluationBody = Partial<CreateEvaluationParams>;
export type UpdateEvaluationResponse = MessageResponse;

export type EvaluationDetailResponse = EvaluationSchemaType;

export type DeleteEvaluationResponse = MessageResponse;

export type ListEvaluationsBody = PaginationProps<{
  searchKey?: string;
}>;

export type StartEvaluationBody = {
  evaluationId: string;
};
export type StartEvaluationResponse = MessageResponse;

export type StopEvaluationBody = {
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

export type ListEvaluationItemsBody = PaginationProps<{
  evalId: string;
}>;

export type UpdateEvaluationItemBody = {
  evalItemId: string;
  userInput?: string;
  expectedOutput?: string;
  variables?: Record<string, any>;
};
export type UpdateEvaluationItemResponse = MessageResponse;

export type EvaluationItemDetailResponse = {
  item: EvalItemSchemaType;
  dataItem: any;
  response?: string;
  result?: any;
  score?: number;
};

export type RetryEvaluationItemBody = {
  evalItemId: string;
};
export type RetryEvaluationItemResponse = MessageResponse;

export type DeleteEvaluationItemResponse = MessageResponse;

// ===== Metric API Types =====

export type CreateMetricBody = CreateMetricParams;
export type CreateMetricResponse = EvalMetricSchemaType;

export type UpdateMetricBody = Partial<CreateMetricParams>;
export type UpdateMetricResponse = MessageResponse;

export type MetricDetailResponse = EvalMetricSchemaType;

export type DeleteMetricResponse = MessageResponse;

export type ListMetricsBody = PaginationProps<{
  searchKey?: string;
}>;

export type TestMetricBody = {
  metricId: string;
  testCase: EvalCase;
};
export type TestMetricResponse = MetricResult;

// ===== Dataset API Types =====

export type CreateDatasetBody = CreateDatasetParams;
export type CreateDatasetResponse = EvalDatasetSchemaType;

export type UpdateDatasetBody = UpdateDatasetParams;
export type UpdateDatasetResponse = MessageResponse;

export type DatasetDetailResponse = EvalDatasetSchemaType;

export type DeleteDatasetResponse = MessageResponse;

export type ListDatasetsBody = PaginationProps<{
  searchKey?: string;
}>;

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
