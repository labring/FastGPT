import { GET } from '@/web/common/api/request';
import type { PaySchema } from '@fastgpt/global/support/wallet/pay/type.d';
import { delay } from '@/utils/tools';

export const getPayOrders = () => GET<PaySchema[]>(`/plusApi/support/wallet/pay/getPayOrders`);

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    payId: string;
  }>(`/plusApi/support/wallet/pay/getPayCode`, { amount });

export const checkPayResult = (payId: string) =>
  GET<number>(`/plusApi/support/wallet/pay/checkPayResult`, { payId }).then(() => {
    async function startQueue() {
      try {
        await GET('/common/system/unlockTask');
      } catch (error) {
        await delay(1000);
        startQueue();
      }
    }
    startQueue();
    return 'success';
  });
