import { GET, POST } from '@/web/common/api/request';
import type { CreateBillProps, CreateBillResponse } from '@fastgpt/global/support/wallet/bill/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import type { BillSchemaType } from '@fastgpt/global/support/wallet/bill/type.d';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getBills = (
  data: PaginationProps<{
    type?: BillTypeEnum;
  }>
) => POST<PaginationResponse<BillSchemaType>>(`/proApi/support/wallet/bill/list`, data);

export const getWxPayQRCode = (data: CreateBillProps) =>
  POST<CreateBillResponse>(`/proApi/support/wallet/bill/create`, data);

export const checkBalancePayResult = (payId: string) =>
  GET<string>(`/proApi/support/wallet/bill/checkPayResult`, { payId }).then((data) => {
    try {
      GET('/common/system/unlockTask');
    } catch (error) {}
    return data;
  });

export const balanceConversion = () => GET<string>(`/proApi/support/wallet/bill/balanceConversion`);
