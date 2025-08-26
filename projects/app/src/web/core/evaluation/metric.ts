import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type { ListMetricsRequest, ListMetricsResponse } from '@fastgpt/global/core/evaluation/api';
import type {
  CreateMetricParams,
  EvaluationMetricSchemaType
} from '@fastgpt/global/core/evaluation/type';

// ==================== 评估指标管理 API ====================

export const createMetric = (data: CreateMetricParams) =>
  POST<EvaluationMetricSchemaType>('/core/evaluation/metric/create', data);

export const getMetricList = (data: ListMetricsRequest) =>
  POST<ListMetricsResponse>('/core/evaluation/metric/list', data);

export const getMetricDetail = (metricId: string) =>
  GET<EvaluationMetricSchemaType>(`/core/evaluation/metric/detail?id=${metricId}`);

export const updateMetric = (metricId: string, data: CreateMetricParams) =>
  PUT<EvaluationMetricSchemaType>(`/core/evaluation/metric/update?id=${metricId}`, data);

export const deleteMetric = (metricId: string) =>
  DELETE(`/core/evaluation/metric/delete?id=${metricId}`);

export const testMetric = (data: { metricId: string; testCase: any }) =>
  POST<{
    success: boolean;
    result?: any;
    error?: string;
  }>('/core/evaluation/metric/test', data);
