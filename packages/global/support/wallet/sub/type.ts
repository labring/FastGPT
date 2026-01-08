import z from 'zod';
import { StandardSubLevelEnum, SubModeEnum, SubTypeEnum } from './constants';
import { ObjectIdSchema } from '../../../common/type/mongo';

// Content of plan
export const TeamStandardSubPlanItemSchema = z.object({
  name: z.string().optional(),
  desc: z.string().optional(),
  price: z.number(),

  totalPoints: z.int(), // 总积分
  maxTeamMember: z.int(),
  maxAppAmount: z.int(),
  maxDatasetAmount: z.int(),
  maxDatasetSize: z.int(),

  requestsPerMinute: z.int().optional(), // QPM
  appRegistrationCount: z.int().optional(), // 应用备案数量
  chatHistoryStoreDuration: z.int(), // 历史记录保留天数
  websiteSyncPerDataset: z.int().optional(), // 站点同步最大页面
  auditLogStoreDuration: z.int().optional(), // 审计日志保留天数
  ticketResponseTime: z.int().optional(), // 工单支持时间
  customDomain: z.int().optional(), // 自定义域名数量

  // 定制套餐
  priceDescription: z.string().optional(), // 价格描述
  customFormUrl: z.string().optional(), // 自定义表单 URL
  customDescriptions: z.array(z.string()).optional(), // 自定义描述

  // Active
  annualBonusPoints: z.int().optional(), // 年度赠送积分

  // @deprecated
  pointPrice: z.number().optional()
});
export type TeamStandardSubPlanItemType = z.infer<typeof TeamStandardSubPlanItemSchema>;

export const StandSubPlanLevelMapSchema = z.record(
  z.enum(StandardSubLevelEnum),
  TeamStandardSubPlanItemSchema
);
export type StandSubPlanLevelMapType = z.infer<typeof StandSubPlanLevelMapSchema>;

export const PointsPackageItemSchema = z.object({
  points: z.int(),
  month: z.int(),
  price: z.number(),
  activityBonusPoints: z.int().optional() // 活动赠送积分
});
export type PointsPackageItem = z.infer<typeof PointsPackageItemSchema>;

export const SubPlanSchema = z.object({
  [SubTypeEnum.standard]: StandSubPlanLevelMapSchema.optional(),
  [SubTypeEnum.extraDatasetSize]: z.object({ price: z.number() }).optional(),
  [SubTypeEnum.extraPoints]: z.object({ packages: PointsPackageItemSchema.array() }).optional(),
  planDescriptionUrl: z.string().optional(),
  appRegistrationUrl: z.string().optional(),
  communitySupportTip: z.string().optional(),
  activityExpirationTime: z.date().optional()
});
export type SubPlanType = z.infer<typeof SubPlanSchema>;

export const TeamSubSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  type: z.enum(SubTypeEnum),
  startTime: z.date(),
  expiredTime: z.date(),

  currentMode: z.enum(SubModeEnum),
  nextMode: z.enum(SubModeEnum),
  currentSubLevel: z.enum(StandardSubLevelEnum),
  nextSubLevel: z.enum(StandardSubLevelEnum),

  maxTeamMember: z.int().optional(),
  maxApp: z.int().optional(),
  maxDataset: z.int().optional(),
  totalPoints: z.int(),
  annualBonusPoints: z.int().optional(),
  surplusPoints: z.int(),
  currentExtraDatasetSize: z.int(),

  // 定制版特有属性
  requestsPerMinute: z.int().optional(),
  chatHistoryStoreDuration: z.int().optional(),
  maxDatasetSize: z.int().optional(),
  websiteSyncPerDataset: z.int().optional(),
  appRegistrationCount: z.int().optional(),
  auditLogStoreDuration: z.int().optional(),
  ticketResponseTime: z.int().optional(),
  customDomain: z.int().optional()
});
export type TeamSubSchemaType = z.infer<typeof TeamSubSchema>;

export const TeamPlanStatusSchema = z.object({
  [SubTypeEnum.standard]: TeamSubSchema.optional(),
  standardConstants: TeamStandardSubPlanItemSchema.optional(),
  totalPoints: z.int(),
  usedPoints: z.int(),
  datasetMaxSize: z.int()
});
export type TeamPlanStatusType = z.infer<typeof TeamPlanStatusSchema>;

export const ClientTeamPlanStatusSchema = TeamPlanStatusSchema.extend({
  usedMember: z.int(),
  usedAppAmount: z.int(),
  usedDatasetSize: z.int(),
  usedDatasetIndexSize: z.int(),
  usedRegistrationCount: z.int()
});
export type ClientTeamPlanStatusType = z.infer<typeof ClientTeamPlanStatusSchema>;
