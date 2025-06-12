import { GET, POST } from '@/web/common/api/request';
import type { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import type { InvoiceType } from '@fastgpt/global/support/wallet/bill/type';
import type { InvoiceSchemaType } from '@fastgpt/global/support/wallet/bill/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

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

export const getInvoiceRecords = (data: PaginationProps) =>
  POST<PaginationResponse<InvoiceSchemaType>>(`/proApi/support/wallet/bill/invoice/records`, data);

export const readInvoiceFile = (id: string) =>
  GET<Blob>(`/proApi/support/wallet/bill/invoice/file/read`, { id }).then((res) => {
    const blob = new Blob([res], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    return url;
  });
