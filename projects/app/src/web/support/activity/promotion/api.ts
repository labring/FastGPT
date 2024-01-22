import { GET, POST, PUT } from '@/web/common/api/request';
import type { PromotionRecordType } from '@/global/support/api/userRes.d';
import type { RequestPaging } from '@/types';

/* get promotion init data */
export const getPromotionInitData = () =>
  GET<{
    invitedAmount: number;
    earningsAmount: number;
  }>('/proApi/support/activity/promotion/getPromotionData');

/* promotion records */
export const getPromotionRecords = (data: RequestPaging) =>
  POST<PromotionRecordType>(`/proApi/support/activity/promotion/getPromotions`, data);
