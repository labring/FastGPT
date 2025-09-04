import type { EvalCase, EvalModelConfigType, MetricConfig } from './type';

export type CreateMetricBody = {
  name: string;
  description?: string;
  prompt: string;
};

export type DebugMetricBody = {
  evalCase: EvalCase;
  llmConfig: EvalModelConfigType;
  metricConfig: MetricConfig;
};

export type UpdateMetricBody = {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
};

export type ListMetricsBody = {
  pageNum?: number;
  pageSize?: number;
  searchKey?: string;
};
