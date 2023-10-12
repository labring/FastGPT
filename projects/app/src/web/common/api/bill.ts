import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { CreateTrainingBillType } from '@/global/common/api/billReq.d';
import type { PaySchema } from '@/types/mongoSchema';
import type { PagingData, RequestPaging } from '@/types';
import { UserBillType } from '@/types/user';

export const getUserBills = (data: RequestPaging) =>
  POST<PagingData<UserBillType>>(`/user/getBill`, data);

export const postCreateTrainingBill = (data: CreateTrainingBillType) =>
  POST<string>(`/common/bill/createTrainingBill`, data);

export const getPayOrders = () => GET<PaySchema[]>(`/user/getPayOrders`);

export const getPayCode = (amount: number) =>
  GET<{
    codeUrl: string;
    payId: string;
  }>(`/plusApi/user/pay/getPayCode`, { amount });

export const checkPayResult = (payId: string) =>
  GET<number>(`/plusApi/user/pay/checkPayResult`, { payId }).then(() => {
    try {
      GET('/user/account/paySuccess');
    } catch (error) {}
    return 'success';
  });
