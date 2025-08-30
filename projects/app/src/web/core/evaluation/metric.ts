import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  CreateMetricRequest,
  CreateMetricResponse,
  ListMetricsRequest,
  ListMetricsResponse,
  MetricDetailResponse,
  UpdateMetricRequest,
  UpdateMetricResponse,
  DeleteMetricResponse,
  TestMetricRequest,
  TestMetricResponse
} from '@fastgpt/global/core/evaluation/api';

// ==================== 评估指标管理 API ====================

export const createMetric = (data: CreateMetricRequest) =>
  POST<CreateMetricResponse>('/core/evaluation/metric/create', data);

export const getMetricList = (data: ListMetricsRequest) =>
  POST<ListMetricsResponse>('/core/evaluation/metric/list', data);

export const getMetricDetail = (metricId: string) =>
  GET<MetricDetailResponse>(`/core/evaluation/metric/detail?metricId=${metricId}`);

export const updateMetric = (data: UpdateMetricRequest) =>
  PUT<UpdateMetricResponse>('/core/evaluation/metric/update', data);

export const deleteMetric = (metricId: string) =>
  DELETE<DeleteMetricResponse>(`/core/evaluation/metric/delete?metricId=${metricId}`);

export const testMetric = (data: TestMetricRequest) =>
  POST<TestMetricResponse>('/core/evaluation/metric/test', data);
