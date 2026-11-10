import { POST } from '@/web/common/api/request';
import type {
  GetUsageBodyType,
  GetUsageDashboardBodyType,
  GetUsageDashboardResponseType,
  GetUsageResponseType,
  UsageFilterOptionsBody,
  UsageFilterOptionsResponse
} from '@fastgpt/global/openapi/support/wallet/usage/api';

export const getUserUsages = (data: GetUsageBodyType) =>
  POST<GetUsageResponseType>(`/proApi/support/wallet/usage/getUsage`, data);

export const getDashboardData = (data: GetUsageDashboardBodyType) =>
  POST<GetUsageDashboardResponseType>(`/proApi/support/wallet/usage/getDashboardData`, data);

export const getUsageFilterOptions = (body: UsageFilterOptionsBody, controller?: AbortController) =>
  POST<UsageFilterOptionsResponse>(`/proApi/support/wallet/usage/filterOptions`, body, {
    cancelToken: controller
  });
