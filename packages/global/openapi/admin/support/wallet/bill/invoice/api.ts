import z from 'zod';
import { PaginationResponseSchema } from '../../../../../api';

export const InvoiceItemSchema = z.object({
  _id: z.string().meta({ description: '发票ID' }),
  teamName: z.string().meta({ description: '团队名称' }),
  emailAddress: z.string().meta({ description: '邮箱地址' }),
  status: z.string().meta({ description: '发票状态' }),
  createTime: z.date().meta({ description: '创建时间' }),
  finishTime: z.date().optional().meta({ description: '完成时间' })
});

export const InvoiceListBodySchema = z.object({
  pageNum: z.number().meta({ description: '页码' }),
  pageSize: z.number().meta({ description: '每页条数' }),
  search: z.string().optional().meta({ description: '搜索关键词（团队名称）' })
});
export const InvoiceListResponseSchema = PaginationResponseSchema(InvoiceItemSchema);

// invoice/finish is multipart/form-data
export const InvoiceFinishBodySchema = z.object({
  invoiceId: z.string().meta({ description: '发票ID' }),
  file: z.string().optional().meta({ description: '发票文件（multipart 上传）' })
});
