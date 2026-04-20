import z from 'zod';
import { SubTypeEnum, StandardSubLevelEnum } from '../constants';
import { CouponTypeEnum } from './constants';

const CustomSubConfigSchema = z.object({
  requestsPerMinute: z.number(),
  maxTeamMember: z.number(),
  maxAppAmount: z.number(),
  maxDatasetAmount: z.number(),
  chatHistoryStoreDuration: z.number(),
  maxDatasetSize: z.number(),
  websiteSyncPerDataset: z.number(),
  appRegistrationCount: z.number(),
  auditLogStoreDuration: z.number(),
  ticketResponseTime: z.number(),
  customDomain: z.number(),
  enableSandbox: z.boolean().optional()
});
export type CustomSubConfig = z.infer<typeof CustomSubConfigSchema>;

const TeamCouponSubSchema = z.object({
  type: z.enum(SubTypeEnum).meta({ description: '套餐类型' }),
  durationDay: z.number().meta({ description: '套餐时长' }),
  level: z.enum(StandardSubLevelEnum).optional().meta({ description: '套餐等级' }),
  extraDatasetSize: z.number().optional().meta({ description: '额外数据集大小' }),
  totalPoints: z.number().optional().meta({ description: '总积分' }),
  customConfig: CustomSubConfigSchema.optional().meta({ description: '自定义配置' })
});
export type TeamCouponSub = z.infer<typeof TeamCouponSubSchema>;

const TeamCouponSchema = z.object({
  key: z.string(),
  subscriptions: z.array(TeamCouponSubSchema).meta({ description: '套餐列表' }),
  redeemedAt: z.coerce.date().optional().meta({ description: '使用时间' }),
  expiredAt: z.coerce.date().optional().meta({ description: '过期时间' }),
  redeemedTeamId: z.string().optional().meta({ description: '使用团队 ID' }),
  type: z.enum(CouponTypeEnum).meta({ description: '优惠券类型' }),
  price: z.number().optional().meta({ description: '价格' }),
  paidAmount: z.number().optional().meta({ description: '实付金额' }),
  transactionId: z.string().optional().meta({ description: '交易 ID' }),
  description: z.string().optional().meta({ description: '描述' }),
  createdAt: z.coerce.date().meta({ description: '创建时间' })
});
export type TeamCouponSchemaType = z.infer<typeof TeamCouponSchema>;
