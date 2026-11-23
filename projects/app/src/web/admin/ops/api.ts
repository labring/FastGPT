import { GET } from '@/web/admin/common/request';
import type {
  GetDatasetSearchPerfEventsQuery,
  GetDatasetSearchPerfEventsResponse,
  GetDatasetSearchPerfQuery,
  GetDatasetSearchPerfResponse
} from '@fastgpt/global/openapi/admin/ops/performance';

/** 获取知识库搜索性能聚合总览（走 /proApi 代理到 pro/admin）。 */
export const getDatasetSearchPerfOverview = (params: Partial<GetDatasetSearchPerfQuery>) =>
  GET<GetDatasetSearchPerfResponse>('/proApi/admin/ops/performance/datasetSearch', params);

/** 分页获取知识库搜索单点排查记录（走 /proApi 代理到 pro/admin）。 */
export const getDatasetSearchPerfEvents = (params: Partial<GetDatasetSearchPerfEventsQuery>) =>
  GET<GetDatasetSearchPerfEventsResponse>(
    '/proApi/admin/ops/performance/datasetSearch/events',
    params
  );
