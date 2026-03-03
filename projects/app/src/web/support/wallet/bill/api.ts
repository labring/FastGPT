import { GET, POST, PUT } from '@/web/common/api/request';
import type {
  CreateBillPropsType,
  CreateBillResponseType,
  GetBillListQueryType,
  GetBillListResponseType,
  CheckPayResultResponseType,
  UpdatePaymentPropsType,
  BillDetailResponseType,
  CancelBillPropsType,
  UpdateBillResponseType
} from '@fastgpt/global/openapi/support/wallet/bill/api';
import { BillStatusEnum } from '@fastgpt/global/support/wallet/bill/constants';

export const getBills = (data: GetBillListQueryType) =>
  POST<GetBillListResponseType>(`/proApi/support/wallet/bill/list`, data);

export const postCreatePayBill = (data: CreateBillPropsType) =>
  POST<CreateBillResponseType>(`/proApi/support/wallet/bill/create`, data);

export const checkBalancePayResult = (payId: string): Promise<CheckPayResultResponseType> =>
  GET<CheckPayResultResponseType>(`/proApi/support/wallet/bill/pay/checkPayResult`, { payId }).then(
    (data) => {
      try {
        if (data.status === BillStatusEnum.SUCCESS) {
          GET('/common/system/unlockTask');
        }
      } catch (error) {}
      return data;
    }
  );

export const putUpdatePayment = (data: UpdatePaymentPropsType) =>
  PUT<UpdateBillResponseType>(`/proApi/support/wallet/bill/pay/updatePayment`, data);

export const balanceConversion = () => GET<string>(`/proApi/support/wallet/bill/balanceConversion`);

export const cancelBill = (data: CancelBillPropsType) =>
  POST(`/proApi/support/wallet/bill/cancel`, data);

export const getBillDetail = (billId: string) =>
  GET<BillDetailResponseType>(`/proApi/support/wallet/bill/detail`, { billId });
