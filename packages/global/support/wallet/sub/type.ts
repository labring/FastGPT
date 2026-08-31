import z from 'zod';
import { StandardSubLevelEnum, SubModeEnum, SubTypeEnum } from './constants';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { IntSchema, NumSchema } from '../../../common/zod';

/**
 * Static plan config, stored in global.subPlans
 */
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

  maxUploadFileSize: z.int().optional(), // 最大上传文件大小（MB）
  maxUploadFileCount: z.int().optional(), // 最大上传文件数量

  enableSandbox: z.boolean().optional(), // 虚拟机

  // 定制套餐
  priceDescription: z.string().optional(), // 价格描述
  customFormUrl: z.string().optional(), // 自定义表单 URL
  customDescriptions: z.array(z.string()).optional(), // 自定义描述

  // Active
  annualBonusPoints: z.int().optional(), // 年度赠送积分

  /** @deprecated */
  pointPrice: z.number().optional()
});
export type TeamStandardSubPlanItemType = z.infer<typeof TeamStandardSubPlanItemSchema>;

/** 定制套餐允许只保存覆盖字段，未配置的权益在使用时继承高级版。 */
export const CustomStandardSubPlanItemSchema = TeamStandardSubPlanItemSchema.partial();
export type CustomStandardSubPlanItemType = Partial<TeamStandardSubPlanItemType>;

export type StandSubPlanLevelMapType = Partial<
  Record<StandardSubLevelEnum, TeamStandardSubPlanItemType>
>;
export const StandSubPlanLevelMapSchema = z.object({
  [StandardSubLevelEnum.free]: TeamStandardSubPlanItemSchema.optional(),
  [StandardSubLevelEnum.basic]: TeamStandardSubPlanItemSchema.optional(),
  [StandardSubLevelEnum.advanced]: TeamStandardSubPlanItemSchema.optional(),
  [StandardSubLevelEnum.custom]: CustomStandardSubPlanItemSchema.optional(),
  [StandardSubLevelEnum.experience]: TeamStandardSubPlanItemSchema.optional(),
  [StandardSubLevelEnum.team]: TeamStandardSubPlanItemSchema.optional(),
  [StandardSubLevelEnum.enterprise]: TeamStandardSubPlanItemSchema.optional()
}) as unknown as z.ZodType<StandSubPlanLevelMapType>;

export const PointsPackageItemSchema = z.object({
  points: z.int(),
  month: z.int(),
  price: z.number(),
  activityBonusPoints: z.int().optional() // 活动赠送积分
});
export type PointsPackageItem = z.infer<typeof PointsPackageItemSchema>;

const OptionalConfigDateInputSchema = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.date().optional()
);

const emptyValueToUndefined = (value: unknown) =>
  value === '' || value === null ? undefined : value;
const configOptionalIntegerInputSchema = z.preprocess(emptyValueToUndefined, IntSchema.optional());
const configOptionalNumberInputSchema = z.preprocess(emptyValueToUndefined, NumSchema.optional());

const TeamStandardSubPlanItemInputSchema = TeamStandardSubPlanItemSchema.extend({
  price: NumSchema.nonnegative(),
  totalPoints: IntSchema,
  maxTeamMember: IntSchema,
  maxAppAmount: IntSchema,
  maxDatasetAmount: IntSchema,
  maxDatasetSize: IntSchema,
  requestsPerMinute: configOptionalIntegerInputSchema,
  appRegistrationCount: configOptionalIntegerInputSchema,
  chatHistoryStoreDuration: IntSchema,
  websiteSyncPerDataset: configOptionalIntegerInputSchema,
  auditLogStoreDuration: configOptionalIntegerInputSchema,
  ticketResponseTime: configOptionalIntegerInputSchema,
  customDomain: configOptionalIntegerInputSchema,
  maxUploadFileSize: configOptionalIntegerInputSchema,
  maxUploadFileCount: configOptionalIntegerInputSchema,
  annualBonusPoints: configOptionalIntegerInputSchema,
  pointPrice: configOptionalNumberInputSchema
});

const CustomStandardSubPlanItemInputSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value).filter(
      ([, fieldValue]) => fieldValue !== '' && fieldValue !== null && fieldValue !== undefined
    )
  );
}, TeamStandardSubPlanItemInputSchema.partial());

const StandSubPlanLevelMapInputSchema = z.object({
  [StandardSubLevelEnum.free]: TeamStandardSubPlanItemInputSchema.optional(),
  [StandardSubLevelEnum.basic]: TeamStandardSubPlanItemInputSchema.optional(),
  [StandardSubLevelEnum.advanced]: TeamStandardSubPlanItemInputSchema.optional(),
  [StandardSubLevelEnum.custom]: CustomStandardSubPlanItemInputSchema.optional(),
  [StandardSubLevelEnum.experience]: TeamStandardSubPlanItemInputSchema.optional(),
  [StandardSubLevelEnum.team]: TeamStandardSubPlanItemInputSchema.optional(),
  [StandardSubLevelEnum.enterprise]: TeamStandardSubPlanItemInputSchema.optional()
});

/** 保存系统套餐配置时的兼容输入；输出始终满足稳定的持久化结构。 */
export const SubPlanInputSchema = z
  .object({
    [SubTypeEnum.standard]: StandSubPlanLevelMapInputSchema.optional(),
    [SubTypeEnum.extraDatasetSize]: z.object({ price: NumSchema.nonnegative() }).optional(),
    [SubTypeEnum.extraPoints]: z
      .object({
        packages: z.array(
          PointsPackageItemSchema.extend({
            points: IntSchema,
            month: IntSchema,
            price: NumSchema.nonnegative(),
            activityBonusPoints: configOptionalIntegerInputSchema
          })
        )
      })
      .optional(),
    planDescriptionUrl: z.string().optional(),
    appRegistrationUrl: z.string().optional(),
    communitySupportTip: z.string().optional(),
    activityExpirationTime: OptionalConfigDateInputSchema
  })
  .transform((subPlans) => SubPlanSchema.parse(subPlans));

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

/**
 * TeamSub Schema in DB.
 * Configs are optional
 */
export const TeamSubSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  type: z.enum(SubTypeEnum),
  startTime: z.date(),
  expiredTime: z.date(),

  currentMode: z.enum(SubModeEnum).optional(),
  nextMode: z.enum(SubModeEnum).optional(),
  currentSubLevel: z.enum(StandardSubLevelEnum),
  nextSubLevel: z.enum(StandardSubLevelEnum).optional(),

  maxTeamMember: z.int().nullish(),
  maxApp: z.int().nullish(),
  maxDataset: z.int().nullish(),
  totalPoints: z.int(),
  annualBonusPoints: z.int().optional(),
  surplusPoints: z.number(),
  currentExtraDatasetSize: z.int().optional(),

  // 定制版特有属性
  requestsPerMinute: z.int().nullish(),
  chatHistoryStoreDuration: z.int().nullish(),
  maxDatasetSize: z.int().nullish(),
  websiteSyncPerDataset: z.int().nullish(),
  appRegistrationCount: z.int().nullish(),
  auditLogStoreDuration: z.int().nullish(),
  ticketResponseTime: z.int().nullish(),
  customDomain: z.int().nullish(),
  maxUploadFileSize: z.int().nullish(),
  maxUploadFileCount: z.int().nullish(),
  enableSandbox: z.boolean().optional() // 虚拟机
});
export type TeamSubSchemaType = z.infer<typeof TeamSubSchema>;

/**
 * Merged plan type: combines DB subscription record metadata with effective plan limits
 *
 * Omits:
 * - maxApp/maxDataset from TeamSubSchema: 这些字段在 DB 中存储，但在合并后的类型中使用 maxAppAmount/maxDatasetAmount
 * - pointPrice from TeamStandardSubPlanItemSchema: 避免与 price 字段冲突
 *
 * Field priority: TeamStandardSubPlanItemSchema fields override TeamSubSchema fields when both exist
 */
export const TeamPlanStandardSchema = z.object({
  ...TeamSubSchema.omit({
    maxApp: true,
    maxDataset: true
  }).shape,
  ...TeamStandardSubPlanItemSchema.omit({
    pointPrice: true,
    price: true
  }).shape,
  currentMode: z.enum(SubModeEnum),
  nextMode: z.enum(SubModeEnum),
  nextSubLevel: z.enum(StandardSubLevelEnum),
  totalPoints: z.number().nullable(),
  surplusPoints: z.number().nullable(),
  currentExtraDatasetSize: z.int(),
  price: z.number().optional()
});

export type TeamPlanStandardType = z.infer<typeof TeamPlanStandardSchema>;

export const TeamPlanStatusSchema = z.object({
  [SubTypeEnum.standard]: TeamPlanStandardSchema.optional(),
  totalPoints: z.number().nullable(),
  usedPoints: z.number().nullable(),
  datasetMaxSize: z.number().nullable()
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
