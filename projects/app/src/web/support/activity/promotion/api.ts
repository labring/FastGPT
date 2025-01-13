import { GET, POST } from '@/web/common/api/request';
import type { PromotionRecordType } from '@/global/support/api/userRes.d';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

/* get promotion init data */
export const getPromotionInitData = () =>
  GET<{
    invitedAmount: number;
    earningsAmount: number;
  }>('/proApi/support/activity/promotion/getPromotionData');

/* promotion records */
export const getPromotionRecords = (data: PaginationProps) =>
  POST<PaginationResponse<PromotionRecordType>>(
    `/proApi/support/activity/promotion/getPromotions`,
    data
  );
