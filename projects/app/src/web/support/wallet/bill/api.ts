import { GET } from '@/web/common/api/request';
import type { BillSchemaType } from '@fastgpt/global/support/wallet/bill/type.d';
export const getBills = () => GET<BillSchemaType[]>(`/proApi/support/wallet/bill/list`);

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
