import { PagingData, RequestPaging } from '@/types';
import { GET, POST } from '@/web/common/api/request';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import { InvoiceType } from '@fastgpt/global/support/wallet/bill/type';
import { InvoiceSchemaType } from '../../../../../../../../packages/global/support/wallet/bill/type';
export type invoiceBillDataType = {
  type: BillTypeEnum;
  price: number;
  createTime: Date;
  _id: string;
};

export const getInvoiceBillsList = () =>
  GET<invoiceBillDataType[]>(`/proApi/support/wallet/bill/invoice/unInvoiceList`);

export const submitInvoice = (data: InvoiceType) =>
  POST(`/proApi/support/wallet/bill/invoice/submit`, data);

export const getInvoiceRecords = (data: RequestPaging) =>
  POST<PagingData<InvoiceSchemaType>>(`/proApi/support/wallet/bill/invoice/records`, data);
