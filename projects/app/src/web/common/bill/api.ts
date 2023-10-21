import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { CreateTrainingBillType } from '@fastgpt/global/common/bill/types/billReq.d';
import type { PaySchema } from '@/types/mongoSchema';
import type { PagingData, RequestPaging } from '@/types';
import { UserBillType } from '@/types/user';
import { delay } from '@/utils/tools';

export const getUserBills = (data: RequestPaging) =>
  POST<PagingData<UserBillType>>(`/user/getBill`, data);

export const postCreateTrainingBill = (data: CreateTrainingBillType) =>
  POST<string>(`/common/bill/createTrainingBill`, data);

export const getPayOrders = () => GET<PaySchema[]>(`/user/getPayOrders`);

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    payId: string;
  }>(`/plusApi/support/user/pay/getPayCode`, { amount });

export const checkPayResult = (payId: string) =>
  GET<number>(`/plusApi/support/user/pay/checkPayResult`, { payId }).then(() => {
    async function startQueue() {
      try {
        await GET('/user/account/paySuccess');
      } catch (error) {
        await delay(1000);
        startQueue();
      }
    }
    startQueue();
    return 'success';
  });
