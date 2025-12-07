import { StandardSubLevelEnum, SubModeEnum } from '../sub/constants';
import { SubTypeEnum } from '../sub/constants';
import { BillPayWayEnum, BillStatusEnum, BillTypeEnum } from './constants';
import type { TeamInvoiceHeaderType } from '../../user/team/type';
import { z } from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

export const BillSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '订单 ID' }),
  userId: ObjectIdSchema.meta({ description: '用户 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  orderId: z.string().meta({ description: '订单 ID' }),
  status: z.enum(BillStatusEnum).meta({ description: '订单状态' }),
  type: z.enum(BillTypeEnum).meta({ description: '订单类型' }),
  price: z.number().meta({ description: '价格' }),
  couponId: ObjectIdSchema.optional().meta({
    description: '优惠券 ID'
  }),
  hasInvoice: z.boolean().meta({ description: '是否已开发票' }),
  metadata: z
    .object({
      payWay: z.enum(BillPayWayEnum).meta({ description: '支付方式' }),
      subMode: z.enum(SubModeEnum).optional().meta({ description: '订阅周期' }),
      standSubLevel: z.enum(StandardSubLevelEnum).optional().meta({ description: '订阅等级' }),
      month: z.number().optional().meta({ description: '月数' }),
      datasetSize: z.number().optional().meta({ description: '数据集大小' }),
      extraPoints: z.number().optional().meta({ description: '额外积分' })
    })
    .meta({ description: '元数据' }),
  refundData: z
    .object({
      amount: z.number().meta({ description: '退款金额' }),
      refundId: z.string().meta({ description: '退款 ID' }),
      refundTime: z.date().meta({ description: '退款时间' })
    })
    .optional()
    .meta({ description: '退款数据' })
});
export type BillSchemaType = z.infer<typeof BillSchema>;

export type ChatNodeUsageType = {
  inputTokens?: number;
  outputTokens?: number;
  totalPoints: number;
  moduleName: string;
  model?: string;
};

export type InvoiceType = {
  amount: number;
  billIdList: string[];
} & TeamInvoiceHeaderType;

export type InvoiceSchemaType = {
  _id: string;
  teamId: string;
  status: 1 | 2;
  createTime: Date;
  finishTime?: Date;
  file?: Buffer;
} & InvoiceType;

export type AIPointsPriceOption = {
  type: 'points';
  points: number;
};

export type DatasetPriceOption = {
  type: 'dataset';
  size: number;
  month: number;
};

export type PriceOption = AIPointsPriceOption | DatasetPriceOption;
