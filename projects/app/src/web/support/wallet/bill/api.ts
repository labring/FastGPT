import { RequestPaging } from '@/types';
import { GET, POST } from '@/web/common/api/request';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import type { BillSchemaType } from '@fastgpt/global/support/wallet/bill/type.d';

export const getBills = (
  data: RequestPaging & {
    type?: `${BillTypeEnum}`;
  }
) => POST<BillSchemaType[]>(`/proApi/support/wallet/bill/list`, data);

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    payId: string;
  }>(`/proApi/support/wallet/bill/getPayCode`, { amount });

export const checkPayResult = (payId: string) =>
  GET<string>(`/proApi/support/wallet/bill/checkPayResult`, { payId }).then((data) => {
    try {
      GET('/common/system/unlockTask');
    } catch (error) {}
    return data;
  });
