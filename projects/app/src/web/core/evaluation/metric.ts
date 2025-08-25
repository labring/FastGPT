import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  CreateMetricParams,
  EvalMetricSchemaType
} from '@fastgpt/global/core/evaluation/type';
import type { PaginationResponse, PaginationProps } from '@fastgpt/web/common/fetch/type';

// ==================== 评估指标管理 API ====================

export const createMetric = (data: CreateMetricParams) =>
  POST<EvalMetricSchemaType>('/core/evaluation/metric/create', data);

export const getMetricList = (
  data: PaginationProps<{
    searchKey?: string;
  }>
) => POST<PaginationResponse<EvalMetricSchemaType>>('/core/evaluation/metric/list', data);

export const getMetricDetail = (metricId: string) =>
  GET<EvalMetricSchemaType>(`/core/evaluation/metric/detail?id=${metricId}`);

export const updateMetric = (metricId: string, data: CreateMetricParams) =>
  PUT<EvalMetricSchemaType>(`/core/evaluation/metric/update?id=${metricId}`, data);

export const deleteMetric = (metricId: string) =>
  DELETE(`/core/evaluation/metric/delete?id=${metricId}`);

export const testMetric = (data: { metricId: string; testCase: any }) =>
  POST<{
    success: boolean;
    result?: any;
    error?: string;
  }>('/core/evaluation/metric/test', data);
