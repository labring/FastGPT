import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { NumSchema } from '../../../../../common/zod';
import { InvoiceStatusEnum } from '../../../../../support/wallet/bill/invoice/constants';
import { PaginationResponseSchema } from '../../../../api';

export const InvoiceItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '发票ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队ID' }),
  teamName: z.string().meta({ description: '团队名称' }),
  unifiedCreditCode: z.string().optional().meta({ description: '统一社会信用代码' }),
  companyAddress: z.string().optional().meta({ description: '公司地址' }),
  companyPhone: z.string().optional().meta({ description: '公司电话' }),
  bankName: z.string().optional().meta({ description: '开户银行' }),
  bankAccount: z.string().optional().meta({ description: '开户账号' }),
  needSpecialInvoice: z.boolean().optional().meta({ description: '是否需要专票' }),
  contactPhone: z.string().optional().meta({ description: '联系电话' }),
  emailAddress: z.string().meta({ description: '邮箱地址' }),
  amount: NumSchema.meta({ description: '开票金额' }),
  status: z.nativeEnum(InvoiceStatusEnum).meta({
    description: '发票状态：1-申请中，2-已完成'
  }),
  billIdList: z.array(ObjectIdSchema).optional().meta({ description: '关联订单ID列表' }),
  createTime: z.date().meta({ description: '创建时间' }),
  finishTime: z.date().optional().meta({ description: '完成时间' }),
  file: z.any().optional().meta({ description: '发票文件' })
});
export type InvoiceItemType = z.infer<typeof InvoiceItemSchema>;

export const InvoiceListBodySchema = z.object({
  pageNum: z.number().meta({ description: '页码' }),
  pageSize: z.number().meta({ description: '每页条数' }),
  search: z.string().optional().meta({ description: '搜索关键词（团队名称）' })
});
export const InvoiceListResponseSchema = PaginationResponseSchema(InvoiceItemSchema);
export type InvoiceListBodyType = z.infer<typeof InvoiceListBodySchema>;
export type InvoiceListResponseType = z.infer<typeof InvoiceListResponseSchema>;

// invoice/finish is multipart/form-data
export const InvoiceFinishBodySchema = z.object({
  invoiceId: z.string().meta({ description: '发票ID' }),
  file: z.string().optional().meta({ description: '发票文件（multipart 上传）' })
});
export const InvoiceFinishDataSchema = InvoiceFinishBodySchema;
export type InvoiceFinishBodyType = z.infer<typeof InvoiceFinishBodySchema>;
export type InvoiceFinishDataType = InvoiceFinishBodyType;
