import { POST } from '@/web/common/api/request';
import type {
  GetUsageBodyType,
  GetUsageDashboardBodyType,
  GetUsageDashboardResponseType,
  GetUsageResponseType,
  UsageFilterOptionsBody,
  UsageFilterOptionsResponse
} from '@fastgpt/global/openapi/support/wallet/usage/api';

/** 用量列表只保留最新请求，翻页或切换筛选时取消上一次读取。 */
export const getUserUsages = (data: GetUsageBodyType) =>
  POST<GetUsageResponseType>(`/proApi/support/wallet/usage/getUsage`, data, { maxQuantity: 1 });

/** 趋势查询独立保留最新请求，避免快速切换筛选时累积读取。 */
export const getDashboardData = (data: GetUsageDashboardBodyType) =>
  POST<GetUsageDashboardResponseType>(`/proApi/support/wallet/usage/getDashboardData`, data, {
    maxQuantity: 1
  });

export const getUsageFilterOptions = (body: UsageFilterOptionsBody, controller?: AbortController) =>
  POST<UsageFilterOptionsResponse>(`/proApi/support/wallet/usage/filterOptions`, body, {
    cancelToken: controller
  });
