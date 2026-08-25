import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { NumSchema } from '../../../../common/zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { SubTypeEnum, StandardSubLevelEnum } from '../../../../support/wallet/sub/constants';

export const PlanItemSchema = z.object({
  id: ObjectIdSchema.meta({ description: '订阅ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队ID' }),
  type: z.enum(SubTypeEnum).meta({ description: '套餐类型' }),
  level: z.enum(StandardSubLevelEnum).optional().meta({ description: '套餐等级' }),
  totalPoints: z.number().optional().meta({ description: '总积分' }),
  surplusPoints: z.number().optional().meta({ description: '剩余积分' }),
  extraDatasetSize: z.number().meta({ description: '额外知识库容量' }),
  startTime: z.date().meta({ description: '生效时间' }),
  expiredTime: z.date().meta({ description: '过期时间' }),
  teamName: z.string().optional().meta({ description: '团队名称' }),
  userName: z.string().optional().meta({ description: '所有者用户名' }),
  maxTeamMember: z.number().nullish().meta({ description: '最大团队成员数' }),
  maxApp: z.number().nullish().meta({ description: '最大应用数' }),
  maxDataset: z.number().nullish().meta({ description: '最大知识库数' }),
  maxDatasetSize: z.number().nullish().meta({ description: '最大知识库容量' }),
  requestsPerMinute: z.number().nullish().meta({ description: '每分钟请求数' }),
  websiteSyncPerDataset: z.number().nullish().meta({ description: '每知识库站点同步数' }),
  chatHistoryStoreDuration: z.number().nullish().meta({ description: '聊天记录保存天数' }),
  appRegistrationCount: z.number().nullish().meta({ description: '应用注册数' }),
  auditLogStoreDuration: z.number().nullish().meta({ description: '审计日志保存天数' }),
  ticketResponseTime: z.number().nullish().meta({ description: '工单响应时间' }),
  customDomain: z.number().nullish().meta({ description: '自定义域名数' }),
  maxUploadFileSize: z.number().nullish().meta({ description: '最大上传文件大小' }),
  maxUploadFileCount: z.number().nullish().meta({ description: '最大上传文件数' }),
  enableSandbox: z.boolean().optional().meta({ description: '是否启用沙盒' })
});
export type PlanItemType = z.infer<typeof PlanItemSchema>;

/* ============================================================================
 * API: 获取套餐列表
 * Route: POST /admin/routes/plans/getPlans
 * Method: POST
 * Description: 分页获取套餐订阅列表，支持按团队所有者用户名搜索
 * Tags: ['Admin', 'Plans', 'Read']
 * ============================================================================ */

export const GetPlansBodySchema = PaginationSchema.extend({
  search: z.string().trim().max(100).optional().meta({ description: '搜索关键词（用户名）' })
});
export type GetPlansBodyType = z.infer<typeof GetPlansBodySchema>;

export const GetPlansResponseSchema = PaginationResponseSchema(PlanItemSchema);
export type GetPlansResponseType = z.infer<typeof GetPlansResponseSchema>;

// addPlans
export const AddPlansBodySchema = z.object({
  teamId: z.string().meta({ description: '团队ID' }),
  type: z.enum(SubTypeEnum).meta({ description: '套餐类型' }),
  startTime: z.string().meta({ description: '开始时间' }),
  expiredTime: z.string().meta({ description: '结束时间' }),
  price: NumSchema.meta({ description: '价格' }),
  level: z.enum(StandardSubLevelEnum).meta({ description: '套餐等级（仅标准套餐需要）' }),
  extraDatasetSize: z.number().optional().meta({ description: '额外知识库容量' }),
  totalPoints: z.number().optional().meta({ description: '总积分' }),
  surplusPoints: z.number().optional().meta({ description: '剩余积分' })
});

// updatePlan
export const UpdatePlanBodySchema = z.object({
  id: z.string().meta({ description: '订阅ID' }),
  type: z.enum(SubTypeEnum).meta({ description: '套餐类型' }),
  startTime: z.string().meta({ description: '开始时间' }),
  expiredTime: z.string().meta({ description: '结束时间' }),
  price: NumSchema.meta({ description: '价格' }),
  totalPoints: NumSchema.optional().meta({ description: '总积分' }),
  surplusPoints: NumSchema.optional().meta({ description: '剩余积分' }),
  extraDatasetSize: NumSchema.optional().meta({ description: '额外知识库容量' }),
  level: z.enum(StandardSubLevelEnum).optional().meta({ description: '套餐等级' }),
  maxTeamMember: NumSchema.optional().meta({ description: '最大团队成员数' }),
  maxApp: NumSchema.optional().meta({ description: '最大应用数' }),
  maxDataset: NumSchema.optional().meta({ description: '最大知识库数' }),
  maxDatasetSize: NumSchema.optional().meta({ description: '最大知识库容量' }),
  requestsPerMinute: NumSchema.optional().meta({ description: '每分钟请求数' }),
  websiteSyncPerDataset: NumSchema.optional().meta({ description: '每知识库站点同步数' }),
  chatHistoryStoreDuration: NumSchema.optional().meta({ description: '聊天记录保存天数' }),
  appRegistrationCount: NumSchema.optional().meta({ description: '应用注册数' }),
  auditLogStoreDuration: NumSchema.optional().meta({ description: '审计日志保存天数' }),
  ticketResponseTime: NumSchema.optional().meta({ description: '工单响应时间' }),
  customDomain: NumSchema.optional().meta({ description: '自定义域名数' }),
  maxUploadFileSize: NumSchema.optional().meta({ description: '最大上传文件大小' }),
  maxUploadFileCount: NumSchema.optional().meta({ description: '最大上传文件数' }),
  enableSandbox: z.boolean().optional().meta({ description: '是否启用沙盒' })
});
