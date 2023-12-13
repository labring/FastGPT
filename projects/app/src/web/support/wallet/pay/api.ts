import { GET } from '@/web/common/api/request';
import type { PaySchema } from '@fastgpt/global/support/wallet/pay/type.d';
export const getPayOrders = () => GET<PaySchema[]>(`/plusApi/support/wallet/pay/getPayOrders`);

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    payId: string;
  }>(`/plusApi/support/wallet/pay/getPayCode`, { amount });

export const checkPayResult = (payId: string) =>
  GET<string>(`/plusApi/support/wallet/pay/checkPayResult`, { payId }).then((data) => {
    try {
      GET('/common/system/unlockTask');
    } catch (error) {}
    return data;
  });
