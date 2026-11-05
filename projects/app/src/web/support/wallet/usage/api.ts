import { POST } from '@/web/common/api/request';
import type {
  GetUsageDashboardProps,
  GetUsageDashboardResponseItem,
  GetUsageProps
} from '@fastgpt/global/support/wallet/usage/api';
import type { UsageListItemType } from '@fastgpt/global/support/wallet/usage/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import {
  UsageQueryResponseSchema,
  UsageFilterOptionsResponseSchema,
  type UsageQueryBody,
  type UsageFilterOptionsBody
} from '@fastgpt/global/openapi/support/wallet/usage/api';

export const getUserUsages = (data: PaginationProps<GetUsageProps>) =>
  POST<PaginationResponse<UsageListItemType>>(`/proApi/support/wallet/usage/getUsage`, data);

export const getDashboardData = (data: GetUsageDashboardProps) =>
  POST<GetUsageDashboardResponseItem[]>(`/proApi/support/wallet/usage/getDashboardData`, data);

/** 每次调用都验证服务端上下文；不跨操作缓存权限或成员关系。 */
export const queryUsage = (body: UsageQueryBody, controller?: AbortController) =>
  POST('/proApi/support/wallet/usage/query', body, { cancelToken: controller }).then((data) =>
    UsageQueryResponseSchema.parse(data)
  );

export const getUsageFilterOptions = (body: UsageFilterOptionsBody, controller?: AbortController) =>
  POST('/proApi/support/wallet/usage/filterOptions', body, { cancelToken: controller }).then(
    (data) => UsageFilterOptionsResponseSchema.parse(data)
  );
