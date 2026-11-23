import { GET } from '@/web/admin/common/request';
import type {
  GetDatasetSearchPerfEventsQuery,
  GetDatasetSearchPerfEventsResponse,
  GetDatasetSearchPerfQuery,
  GetDatasetSearchPerfResponse
} from '@fastgpt/global/openapi/admin/ops/performance';

/** 识别商业版总览接口是否返回完整结构，过滤 silentDegrade404 降级产生的 `{ total: 0, list: [] }`。 */
const isValidDatasetSearchPerfOverview = (
  value: unknown
): value is GetDatasetSearchPerfResponse => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GetDatasetSearchPerfResponse>;
  return Boolean(
    candidate.meta &&
    typeof candidate.meta.bucketGranularity === 'string' &&
    candidate.summary &&
    typeof candidate.summary.totalCount === 'number' &&
    Array.isArray(candidate.trend) &&
    Array.isArray(candidate.stageStats)
  );
};

/** 获取知识库搜索性能聚合总览（走 /proApi 代理到 pro/admin）；商业版未配置或滚动升级 404 时返回 undefined。 */
export const getDatasetSearchPerfOverview = async (
  params: Partial<GetDatasetSearchPerfQuery>
): Promise<GetDatasetSearchPerfResponse | undefined> => {
  const data = await GET<GetDatasetSearchPerfResponse>(
    '/proApi/admin/ops/performance/datasetSearch',
    params
  );
  return isValidDatasetSearchPerfOverview(data) ? data : undefined;
};

/** 分页获取知识库搜索单点排查记录（走 /proApi 代理到 pro/admin）。 */
export const getDatasetSearchPerfEvents = async (
  params: Partial<GetDatasetSearchPerfEventsQuery>
): Promise<GetDatasetSearchPerfEventsResponse> => {
  const data = await GET<GetDatasetSearchPerfEventsResponse>(
    '/proApi/admin/ops/performance/datasetSearch/events',
    params
  );
  if (data && Array.isArray(data.list) && typeof data.total === 'number') {
    return data;
  }
  return { total: 0, list: [] };
};
