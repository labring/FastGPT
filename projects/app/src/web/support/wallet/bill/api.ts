import { GET, POST } from '@/web/common/api/request';
import { CreateTrainingBillProps } from '@fastgpt/global/support/wallet/bill/api.d';
import type { PagingData, RequestPaging } from '@/types';
import type { BillItemType } from '@fastgpt/global/support/wallet/bill/type';

export const getUserBills = (data: RequestPaging) =>
  POST<PagingData<BillItemType>>(`/plusApi/support/wallet/bill/getBill`, data);

export const postCreateTrainingBill = (data: CreateTrainingBillProps) =>
  POST<string>(`/support/wallet/bill/createTrainingBill`, data);
