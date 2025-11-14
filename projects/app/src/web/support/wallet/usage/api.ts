import { POST } from '@/web/common/api/request';
import type {
  CreateTrainingUsageProps,
  GetUsageDashboardProps,
  GetUsageDashboardResponseItem,
  GetUsageProps
} from '@fastgpt/global/support/wallet/usage/api.d';
import type { UsageListItemType } from '@fastgpt/global/support/wallet/usage/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getUserUsages = (data: PaginationProps<GetUsageProps>) =>
  POST<PaginationResponse<UsageListItemType>>(`/proApi/support/wallet/usage/getUsage`, data);

export const getDashboardData = (data: GetUsageDashboardProps) =>
  POST<GetUsageDashboardResponseItem[]>(`/proApi/support/wallet/usage/getDashboardData`, data);

export const postCreateTrainingUsage = (data: CreateTrainingUsageProps) =>
  POST<string>(`/support/wallet/usage/createTrainingUsage`, data);
