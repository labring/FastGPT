import { POST } from '@/web/admin/common/request';
import type { InvoiceSchemaType } from '@fastgpt/global/support/wallet/bill/type';
import type { InvoiceListBodyType } from '@fastgpt/global/openapi/admin/wallet/bill/invoice/api';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';

export const getInvoiceList = (data: Partial<InvoiceListBodyType>) =>
  POST<PaginationResponse<InvoiceSchemaType>>('/proApi/admin/wallet/bill/invoice/list', data, {
    maxQuantity: 1
  });

export const finishInvoice = (data: FormData) =>
  POST('/proApi/admin/wallet/bill/invoice/finish', data, {
    timeout: 600000
  });

export const getInvoiceDownloadUrl = (invoiceId: string) =>
  `/api/proApi/admin/wallet/bill/invoice/downloadFile?id=${encodeURIComponent(invoiceId)}`;
