import { POST } from '@/web/admin/common/request';
import type { InvoiceSchemaType } from '@fastgpt/global/support/wallet/bill/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';

export const getInvoiceList = (data: PaginationProps<{ search?: string }>) =>
  POST<PaginationResponse<InvoiceSchemaType>>('/proApi/admin/wallet/bill/invoice/list', data);

export const finishInvoice = (data: FormData) =>
  POST('/proApi/admin/wallet/bill/invoice/finish', data, {
    timeout: 600000
  });

export const getInvoiceDownloadUrl = (invoiceId: string) =>
  `/api/proApi/admin/wallet/bill/invoice/downloadFile?id=${encodeURIComponent(invoiceId)}`;
