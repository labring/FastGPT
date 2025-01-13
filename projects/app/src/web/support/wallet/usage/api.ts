import { POST } from '@/web/common/api/request';
import { CreateTrainingUsageProps } from '@fastgpt/global/support/wallet/usage/api.d';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { UsageItemType } from '@fastgpt/global/support/wallet/usage/type';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getUserUsages = (
  data: PaginationProps<{
    dateStart: Date;
    dateEnd: Date;
    source?: UsageSourceEnum;
    teamMemberId: string;
  }>
) => POST<PaginationResponse<UsageItemType>>(`/proApi/support/wallet/usage/getUsage`, data);

export const postCreateTrainingUsage = (data: CreateTrainingUsageProps) =>
  POST<string>(`/support/wallet/usage/createTrainingUsage`, data);
