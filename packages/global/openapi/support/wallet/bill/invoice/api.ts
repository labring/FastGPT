import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { NumSchema } from '../../../../../common/zod';
import { InvoiceStatusEnum } from '../../../../../support/wallet/bill/invoice/constants';
import { BillTypeEnum } from '../../../../../support/wallet/bill/constants';
import { PaginationResponseSchema, PaginationSchema } from '../../../../api';

/* ============================================================================
 * API: 钱包发票管理
 * Route: /api/proApi/support/wallet/bill/invoice/*
 * Method: GET/POST
 * Description: 查询可开票订单、提交开票申请、查询发票记录和下载发票文件。
 * Tags: ['发票管理']
 * ============================================================================ */

export const InvoiceSubmitBodySchema = z
  .object({
    amount: NumSchema.nonnegative().meta({ example: 9900, description: '开票金额' }),
    billIdList: z
      .array(ObjectIdSchema)
      .min(1)
      .meta({
        example: ['68ee0bd23d17260b7829b137'],
        description: '需要开票的订单 ID 列表'
      }),
    teamName: z
      .string()
      .trim()
      .min(1)
      .meta({ example: '示例科技有限公司', description: '团队名称' }),
    unifiedCreditCode: z.string().trim().min(1).meta({
      example: '91110000MA1234567X',
      description: '统一社会信用代码'
    }),
    companyAddress: z
      .string()
      .optional()
      .meta({ example: '北京市朝阳区示例路 1 号', description: '公司地址' }),
    companyPhone: z.string().optional().meta({ example: '010-12345678', description: '公司电话' }),
    bankName: z.string().optional().meta({ example: '示例银行', description: '开户银行' }),
    bankAccount: z
      .string()
      .optional()
      .meta({ example: '6222000000000000000', description: '银行账号' }),
    needSpecialInvoice: z.boolean().meta({ example: false, description: '是否需要增值税专用发票' }),
    contactPhone: z
      .string()
      .trim()
      .min(1)
      .meta({ example: '13800138000', description: '联系人电话' }),
    emailAddress: z
      .string()
      .email()
      .meta({ example: 'billing@example.com', description: '发票接收邮箱' })
  })
  .meta({ description: '开票申请参数' });
export type InvoiceSubmitBodyType = z.infer<typeof InvoiceSubmitBodySchema>;

export const InvoiceRecordsBodySchema = PaginationSchema.meta({
  description: '发票记录分页参数'
});
export type InvoiceRecordsBodyType = z.infer<typeof InvoiceRecordsBodySchema>;

export const InvoiceRecordSchema = z
  .object({
    _id: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b139', description: '发票记录 ID' }),
    teamId: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b138', description: '团队 ID' }),
    amount: NumSchema.meta({ example: 9900, description: '开票金额' }),
    status: z.nativeEnum(InvoiceStatusEnum).meta({
      example: InvoiceStatusEnum.submitted,
      description: '发票状态：1-申请中，2-已完成'
    }),
    createTime: z.coerce.date().meta({
      example: '2026-01-01T00:00:00.000Z',
      description: '申请时间'
    }),
    finishTime: z.coerce.date().optional().meta({
      example: '2026-01-03T00:00:00.000Z',
      description: '完成时间'
    }),
    billIdList: z.array(ObjectIdSchema).meta({
      description: '关联订单 ID 列表'
    }),
    teamName: z.string().meta({ example: '示例科技有限公司', description: '团队名称' }),
    unifiedCreditCode: z
      .string()
      .meta({ example: '91110000MA1234567X', description: '统一社会信用代码' }),
    companyAddress: z.string().optional().meta({ description: '公司地址' }),
    companyPhone: z.string().optional().meta({ description: '公司电话' }),
    bankName: z.string().optional().meta({ description: '开户银行' }),
    bankAccount: z.string().optional().meta({ description: '银行账号' }),
    needSpecialInvoice: z.boolean().meta({ example: false, description: '是否为增值税专用发票' }),
    contactPhone: z
      .string()
      .nullish()
      .transform((value) => value ?? '-')
      .meta({ example: '13800138000', description: '联系人电话；历史记录缺失时返回 -' }),
    emailAddress: z.string().meta({ example: 'billing@example.com', description: '发票接收邮箱' })
  })
  .meta({ description: '发票记录；文件内容不在列表接口中返回' });
export type InvoiceRecordType = z.infer<typeof InvoiceRecordSchema>;

export const InvoiceRecordsResponseSchema = PaginationResponseSchema(InvoiceRecordSchema).meta({
  description: '发票记录分页列表'
});
export type InvoiceRecordsResponseType = z.infer<typeof InvoiceRecordsResponseSchema>;

export const UnInvoiceListItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({
      example: '68ee0bd23d17260b7829b137',
      description: '待开票订单 ID'
    }),
    price: NumSchema.meta({ example: 9900, description: '订单金额' }),
    type: z
      .enum(BillTypeEnum)
      .meta({ example: BillTypeEnum.standSubPlan, description: '订单类型' }),
    createTime: z.coerce.date().meta({
      example: '2026-01-01T00:00:00.000Z',
      description: '订单创建时间'
    }),
    orderId: z.string().meta({ example: 'a1b2c3d4e5f6g7h8i9j0', description: '订单号' })
  })
  .meta({ description: '待开票订单' });
export type UnInvoiceListItemType = z.infer<typeof UnInvoiceListItemSchema>;
export const UnInvoiceListResponseSchema = z.array(UnInvoiceListItemSchema).meta({
  description: '待开票订单列表'
});
export type UnInvoiceListResponseType = z.infer<typeof UnInvoiceListResponseSchema>;

export const InvoiceDownloadFileQuerySchema = z.object({
  id: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b139', description: '发票记录 ID' })
});
export type InvoiceDownloadFileQueryType = z.infer<typeof InvoiceDownloadFileQuerySchema>;

export const InvoiceDownloadFileContentSchema = z.string().meta({
  format: 'binary',
  description: '发票 PDF 文件内容'
});

/* ============================================================================
 * API: 团队发票抬头管理
 * Route: GET /api/proApi/support/wallet/bill/invoice/account/getTeamHeader
 * Method: GET/POST
 * Description: 获取或更新当前团队的发票抬头信息。
 * Tags: ['发票管理']
 * ============================================================================ */

const InvoiceHeaderFieldsSchema = InvoiceSubmitBodySchema.pick({
  teamName: true,
  unifiedCreditCode: true,
  companyAddress: true,
  companyPhone: true,
  bankName: true,
  bankAccount: true,
  needSpecialInvoice: true,
  contactPhone: true,
  emailAddress: true
}).meta({ description: '团队发票抬头字段' });

export const TeamInvoiceHeaderSchema = InvoiceHeaderFieldsSchema.extend({
  _id: ObjectIdSchema.optional().meta({ description: '发票抬头 ID' }),
  teamId: ObjectIdSchema.optional().meta({ description: '团队 ID' })
}).meta({ description: '团队发票抬头信息' });

export const GetTeamHeaderResponseSchema = TeamInvoiceHeaderSchema.partial().meta({
  description: '当前团队的发票抬头信息；尚未设置时返回空对象'
});
export type GetTeamHeaderResponseType = z.infer<typeof GetTeamHeaderResponseSchema>;

export const UpdateTeamHeaderBodySchema = InvoiceHeaderFieldsSchema.meta({
  description: '更新团队发票抬头参数'
});
export type UpdateTeamHeaderBodyType = z.infer<typeof UpdateTeamHeaderBodySchema>;
