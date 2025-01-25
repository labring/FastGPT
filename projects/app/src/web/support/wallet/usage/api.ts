import { POST } from '@/web/common/api/request';
import {
  CreateTrainingUsageProps,
  GetUsageDashboardProps,
  GetUsageDashboardResponseItem,
  GetUsageProps
} from '@fastgpt/global/support/wallet/usage/api.d';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getUserUsages = (data: PaginationProps<GetUsageProps>) =>
  POST<PaginationResponse<UsageItemType>>(`/proApi/support/wallet/usage/getUsage`, data);

export const getDashboardData = (data: GetUsageDashboardProps) =>
  POST<GetUsageDashboardResponseItem[]>(`/proApi/support/wallet/usage/getDashboardData`, data);

export const postCreateTrainingUsage = (data: CreateTrainingUsageProps) =>
  POST<string>(`/support/wallet/usage/createTrainingUsage`, data);
