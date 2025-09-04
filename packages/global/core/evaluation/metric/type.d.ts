import type { EvalDatasetDataKeyEnum } from '../dataset/constants';
import type { ModelTypeEnum, EvalMetricTypeEnum } from './constants';

export type EvalModelConfigType = {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  parameters?: Record<string, any>;
};

export type EvalCase = {
  [EvalDatasetDataKeyEnum.UserInput]?: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]?: string;
  [EvalDatasetDataKeyEnum.ActualOutput]?: string;
  [EvalDatasetDataKeyEnum.Context]?: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]?: string[];
};

export type MetricResult = {
  metricName: string;
  status: string;
  data?: EvaluationResult;
  usages?: Usage[];
  error?: string;
  totalPoints?: number;
};

export type EvalMetricSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  type: EvalMetricTypeEnum;
  prompt?: string;

  userInputRequired: boolean;
  actualOutputRequired: boolean;
  expectedOutputRequired: boolean;
  contextRequired: boolean;
  retrievalContextRequired: boolean;

  embeddingRequired: boolean;
  llmRequired: boolean;

  createTime: Date;
  updateTime: Date;
};

export type HttpConfig = {
  url: string;
  timeout?: number;
};

export type MetricConfig = {
  metricName: string;
  metricType: EvalMetricTypeEnum;
  prompt?: string;
};

export type EvaluationRequest = {
  evalCase: EvalCase;
  metricConfig: MetricConfig;
  embeddingConfig?: EvalModelConfigType | null;
  llmConfig?: EvalModelConfigType | null;
};

export type EvaluationResult = {
  metricName: string;
  score: number;
  reason?: string;
  run_logs?: Record<string, any>;
};

export type Usage = {
  model_type: ModelTypeEnum;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type EvaluationResponse = {
  status: string;
  data?: EvaluationResult;
  usages?: Usage[];
  error?: string;
};

export type MetricDefinition = {
  name: string;
  description: string;
  requireQuestion: boolean;
  requireActualResponse: boolean;
  requireExpectedResponse: boolean;
  requireContext: boolean;
  requireRetrievalContext: boolean;
};
