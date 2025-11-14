import { GET, POST, PUT } from '@/web/common/api/request';
import type {
  CheckPayResultResponse,
  CreateBillProps,
  CreateBillResponse,
  CreateOrderResponse,
  UpdatePaymentProps
} from '@fastgpt/global/support/wallet/bill/api';
import type { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { BillStatusEnum } from '@fastgpt/global/support/wallet/bill/constants';
import type { BillSchemaType } from '@fastgpt/global/support/wallet/bill/type.d';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export const getBills = (
  data: PaginationProps<{
    type?: BillTypeEnum;
  }>
) => POST<PaginationResponse<BillSchemaType>>(`/proApi/support/wallet/bill/list`, data);

export const postCreatePayBill = (data: CreateBillProps) =>
  POST<CreateBillResponse>(`/proApi/support/wallet/bill/create`, data);

export const checkBalancePayResult = (payId: string) =>
  GET<CheckPayResultResponse>(`/proApi/support/wallet/bill/pay/checkPayResult`, { payId }).then(
    (data) => {
      try {
        if (data.status === BillStatusEnum.SUCCESS) {
          GET('/common/system/unlockTask');
        }
      } catch (error) {}
      return data;
    }
  );

export const putUpdatePayment = (data: UpdatePaymentProps) =>
  PUT<CreateOrderResponse>(`/proApi/support/wallet/bill/pay/updatePayment`, data);

export const balanceConversion = () => GET<string>(`/proApi/support/wallet/bill/balanceConversion`);
