import { GET, POST } from '@/web/common/api/request';
import type { InvoiceFileInfo } from '@fastgpt/global/support/wallet/bill/invoice/type';
import type { InvoiceType } from '@fastgpt/global/support/wallet/bill/type';
import type { InvoiceSchemaType } from '@fastgpt/global/support/wallet/bill/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import type {
  UnInvoiceListItemType,
  UnInvoiceListResponseType
} from '@fastgpt/global/openapi/support/wallet/bill/invoice/api';

export type invoiceBillDataType = UnInvoiceListItemType;

export const getInvoiceBillsList = () =>
  GET<UnInvoiceListResponseType>(`/proApi/support/wallet/bill/invoice/unInvoiceList`);

export const submitInvoice = (data: InvoiceType) =>
  POST(`/proApi/support/wallet/bill/invoice/submit`, data);

export const getInvoiceRecords = (data: PaginationProps) =>
  POST<PaginationResponse<InvoiceSchemaType>>(`/proApi/support/wallet/bill/invoice/records`, data);
