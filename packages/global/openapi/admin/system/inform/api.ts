import z from 'zod';
import { IntSchema } from '../../../../common/zod';
import { createPaginationSchema, PaginationResponseSchema, PaginationSchema } from '../../../api';
import { ModelIdsSchema } from '../../../core/ai/model/api';
import {
  InformLevelEnum,
  ModelDeprecationInformChannelEnum,
  ModelDeprecationInformFailureStatusEnum,
  ModelDeprecationInformRunKindEnum,
  ModelDeprecationInformRunStatusEnum
} from '../../../../support/user/inform/constants';

export const ModelDeprecationInformChannelSchema = z.enum(ModelDeprecationInformChannelEnum).meta({
  description: '通知渠道',
  example: 'email'
});
export type ModelDeprecationInformChannelType = z.infer<typeof ModelDeprecationInformChannelSchema>;

const ModelDeprecationInformRunStatusSchema = z.enum(ModelDeprecationInformRunStatusEnum);
const ModelDeprecationInformRunKindSchema = z.enum(ModelDeprecationInformRunKindEnum);
const ModelDeprecationInformFailureStatusSchema = z.enum(ModelDeprecationInformFailureStatusEnum);

/**
 * API: 创建模型下架通知计划
 * Route: POST /api/admin/system/inform/modelDeprecation/create
 * Method: POST
 * Description: 为即将下架模型创建多轮通知计划
 * Tags: ['Admin', 'Inform', 'Write']
 */
export const CreateModelDeprecationInformBodySchema = z.object({
  requestId: z.string().min(1).max(128).meta({
    description: '本次创建请求的幂等标识；重试同一提交时保持不变',
    example: 'model-deprecation-request-7f3d'
  }),
  models: ModelIdsSchema.meta({
    description: '计划通知的模型稳定 ID 列表',
    example: ['68ad85a7463006c963799a05']
  }),
  plannedDeprecationAt: z.string().date().meta({
    description: '浏览器选择的计划下架日，格式 YYYY-MM-DD，用于通知文案',
    example: '2026-12-31'
  }),
  channels: z
    .array(ModelDeprecationInformChannelSchema)
    .min(1)
    .max(3)
    .superRefine((channels, ctx) => {
      if (new Set(channels).size !== channels.length) {
        ctx.addIssue({ code: 'custom', message: '通知渠道不能重复' });
      }
    })
    .meta({
      description: '通知渠道；站内信只在首轮发送',
      example: ['inApp', 'email']
    })
});
export type CreateModelDeprecationInformBodyType = z.infer<
  typeof CreateModelDeprecationInformBodySchema
>;

export const CreateModelDeprecationInformResponseSchema = z.object({
  id: z.string().meta({
    description: '通知计划 ID',
    example: '68ad85a7463006c963799a05'
  })
});
export type CreateModelDeprecationInformResponseType = z.infer<
  typeof CreateModelDeprecationInformResponseSchema
>;

/**
 * API: 查询模型下架通知历史
 * Route: POST /api/admin/system/inform/modelDeprecation/list
 * Method: POST
 * Description: 分页查询模型下架通知计划及轮次状态
 * Tags: ['Admin', 'Inform', 'Read']
 */
export const ListModelDeprecationInformQuerySchema = PaginationSchema.meta({
  description: '模型下架通知历史分页参数'
});
export type ListModelDeprecationInformQueryType = z.infer<
  typeof ListModelDeprecationInformQuerySchema
>;

export const ModelDeprecationInformHistoryRunSchema = z.object({
  runIndex: IntSchema.meta({ description: '计划内稳定轮次索引，从 0 开始', example: 0 }),
  kind: ModelDeprecationInformRunKindSchema.meta({ description: '轮次类型', example: 'delivery' }),
  status: ModelDeprecationInformRunStatusSchema.meta({
    description: '轮次状态',
    example: 'scheduled'
  }),
  scheduledAt: z.string().datetime().optional().meta({
    description: '计划发送时间；人工重发轮次不设置',
    example: '2026-10-30T00:00:00.000Z'
  }),
  channels: z
    .array(ModelDeprecationInformChannelSchema)
    .optional()
    .meta({
      description: '本轮发送渠道；人工重发轮次不设置',
      example: ['email']
    }),
  sourceRunIndex: IntSchema.optional().meta({ description: '人工重发来源轮次索引', example: 0 }),
  failureCount: IntSchema.meta({ description: '本轮产生的投递失败记录总数', example: 2 }),
  lastStatusAt: z.string().datetime().optional().meta({
    description: '最近一次状态变更时间',
    example: '2026-10-30T00:01:00.000Z'
  }),
  errorSummary: z
    .string()
    .optional()
    .meta({ description: '轮次级错误摘要', example: 'worker attempts exhausted' })
});
export type ModelDeprecationInformHistoryRunType = z.infer<
  typeof ModelDeprecationInformHistoryRunSchema
>;

export const ModelDeprecationInformHistoryItemSchema = z.object({
  id: z.string().meta({
    description: '通知计划 ID',
    example: '68ad85a7463006c963799a05'
  }),
  models: ModelIdsSchema.meta({
    description: '通知计划中的模型稳定 ID',
    example: ['68ad85a7463006c963799a05']
  }),
  plannedDeprecationAt: z.string().date().meta({
    description: '浏览器选择的计划下架日，格式 YYYY-MM-DD',
    example: '2026-12-31'
  }),
  createdAt: z.string().datetime().meta({
    description: '通知计划创建时间',
    example: '2026-10-29T00:00:00.000Z'
  }),
  runs: z.array(ModelDeprecationInformHistoryRunSchema).meta({
    description: '通知执行历史',
    example: []
  })
});
export type ModelDeprecationInformHistoryItemType = z.infer<
  typeof ModelDeprecationInformHistoryItemSchema
>;

const ModelDeprecationInformPaginationResponseSchema = PaginationResponseSchema(
  ModelDeprecationInformHistoryItemSchema
);
export const ListModelDeprecationInformResponseSchema =
  ModelDeprecationInformPaginationResponseSchema.extend({
    total: ModelDeprecationInformPaginationResponseSchema.shape.total.meta({
      description: '通知计划总数',
      example: 3
    }),
    list: ModelDeprecationInformPaginationResponseSchema.shape.list.meta({
      description: '通知计划列表',
      example: []
    })
  });
export type ListModelDeprecationInformResponseType = z.infer<
  typeof ListModelDeprecationInformResponseSchema
>;

export const ModelDeprecationInformRunBodySchema = z.object({
  campaignId: z
    .string()
    .min(1)
    .meta({ description: '通知计划 ID', example: '68ad85a7463006c963799a05' }),
  runIndex: IntSchema.meta({ description: '轮次索引', example: 0 })
});
export type ModelDeprecationInformRunBodyType = z.infer<typeof ModelDeprecationInformRunBodySchema>;

/**
 * API: 查询模型下架通知轮次失败明细
 * Route: POST /api/admin/system/inform/modelDeprecation/failures
 * Method: POST
 * Description: 按通知计划和轮次分页查询失败投递记录
 * Tags: ['Admin', 'Inform', 'Read']
 */
export const ListModelDeprecationInformFailuresBodySchema = createPaginationSchema(
  ModelDeprecationInformRunBodySchema.shape
);
export type ListModelDeprecationInformFailuresBodyType = z.infer<
  typeof ListModelDeprecationInformFailuresBodySchema
>;

export const ModelDeprecationInformFailureSchema = z.object({
  id: z.string().meta({ description: '失败记录 ID', example: '68ad85a7463006c963799a06' }),
  runIndex: IntSchema.meta({ description: '失败所属轮次索引', example: 0 }),
  teamId: z.string().meta({ description: '关联团队 ID', example: '68ad85a7463006c963799a07' }),
  channel: ModelDeprecationInformChannelSchema,
  targetId: z
    .string()
    .meta({ description: '稳定收件目标 ID，不包含联系方式', example: '68ad85a7463006c963799a08' }),
  errorSummary: z
    .string()
    .meta({ description: '投递错误摘要', example: 'Provider request failed' }),
  stacktrace: z
    .string()
    .optional()
    .meta({ description: '投递错误堆栈', example: 'Error: Provider request failed' }),
  failedAt: z
    .string()
    .datetime()
    .meta({ description: '失败时间', example: '2026-10-30T00:01:00.000Z' }),
  status: ModelDeprecationInformFailureStatusSchema.meta({
    description: '失败记录状态',
    example: 'unresolved'
  }),
  sourceFailureId: z
    .string()
    .optional()
    .meta({ description: '本失败记录重试来源 ID', example: '68ad85a7463006c963799a09' })
});
export type ModelDeprecationInformFailureType = z.infer<typeof ModelDeprecationInformFailureSchema>;

export const ListModelDeprecationInformFailuresResponseSchema = PaginationResponseSchema(
  ModelDeprecationInformFailureSchema
);
export type ListModelDeprecationInformFailuresResponseType = z.infer<
  typeof ListModelDeprecationInformFailuresResponseSchema
>;

/**
 * API: 恢复模型下架通知轮次
 * Route: POST /api/admin/system/inform/modelDeprecation/recover
 * Method: POST
 * Description: 使用原轮次和游标恢复失败或中断的执行
 * Tags: ['Admin', 'Inform', 'Write']
 */
export const ModelDeprecationInformRunResponseSchema = z.object({
  runIndex: IntSchema.meta({ description: '轮次索引', example: 0 })
});
export type ModelDeprecationInformRunResponseType = z.infer<
  typeof ModelDeprecationInformRunResponseSchema
>;

/**
 * API: 重发模型下架通知失败记录
 * Route: POST /api/admin/system/inform/modelDeprecation/retry
 * Method: POST
 * Description: 为指定已完成轮次中未解决的失败记录创建人工重发轮次
 * Tags: ['Admin', 'Inform', 'Write']
 */
export const RetryModelDeprecationInformRunResponseSchema =
  ModelDeprecationInformRunResponseSchema.extend({
    created: z.boolean().meta({ description: '本次请求是否新建重发轮次', example: true })
  });
export type RetryModelDeprecationInformRunResponseType = z.infer<
  typeof RetryModelDeprecationInformRunResponseSchema
>;

/**
 * API: 终止模型下架通知计划
 * Route: POST /api/admin/system/inform/modelDeprecation/terminate
 * Method: POST
 * Description: 终止整条计划并返回已终止和已跳过的轮次索引
 * Tags: ['Admin', 'Inform', 'Write']
 */
export const TerminateModelDeprecationInformPlanBodySchema =
  ModelDeprecationInformRunBodySchema.pick({
    campaignId: true
  });
export type TerminateModelDeprecationInformPlanBodyType = z.infer<
  typeof TerminateModelDeprecationInformPlanBodySchema
>;
export const TerminateModelDeprecationInformPlanResponseSchema = z.object({
  terminatedRunIndexes: z.array(IntSchema).meta({ description: '已终止轮次索引', example: [0] }),
  skippedRunIndexes: z.array(IntSchema).meta({ description: '已跳过轮次索引', example: [1, 2] })
});
export type TerminateModelDeprecationInformPlanResponseType = z.infer<
  typeof TerminateModelDeprecationInformPlanResponseSchema
>;

// Send system inform
export const SendSystemInformBodySchema = z.object({
  title: z.string().meta({ description: '通知标题' }),
  content: z.string().meta({ description: '通知内容' }),
  level: z.enum(InformLevelEnum).meta({ description: '通知等级' })
});
export type SendSystemInformBodyType = z.infer<typeof SendSystemInformBodySchema>;

// Update system modal
export const UpdateSystemModalBodySchema = z.object({
  content: z.string().meta({ description: '系统弹窗内容' })
});
export type UpdateSystemModalBodyType = z.infer<typeof UpdateSystemModalBodySchema>;

// Update operational ad
export const UpdateOperationalAdBodySchema = z.object({
  operationalAdImage: z.string().meta({ description: '活动图片URL' }),
  operationalAdLink: z.string().meta({ description: '活动链接' })
});
export type UpdateOperationalAdBodyType = z.infer<typeof UpdateOperationalAdBodySchema>;

// Update activity ad
export const UpdateActivityAdBodySchema = z.object({
  activityAdImage: z.string().meta({ description: '底部广告图片URL' }),
  activityAdLink: z.string().meta({ description: '底部广告链接' })
});
export type UpdateActivityAdBodyType = z.infer<typeof UpdateActivityAdBodySchema>;

// Response schemas
export const SystemMsgModalResponseSchema = z
  .object({
    id: z.string().meta({ description: '弹窗ID' }),
    content: z.string().meta({ description: '弹窗内容' })
  })
  .optional();
export type SystemMsgModalValueType = z.infer<typeof SystemMsgModalResponseSchema>;

export const OperationalAdResponseSchema = z
  .object({
    id: z.string().meta({ description: '广告ID' }),
    operationalAdImage: z.string().meta({ description: '广告图片URL' }),
    operationalAdLink: z.string().meta({ description: '广告链接' })
  })
  .optional();
export type OperationalAdResponseType = z.infer<typeof OperationalAdResponseSchema>;

export const ActivityAdResponseSchema = z
  .object({
    id: z.string().meta({ description: '广告ID' }),
    activityAdImage: z.string().meta({ description: '广告图片URL' }),
    activityAdLink: z.string().meta({ description: '广告链接' })
  })
  .optional();
export type ActivityAdResponseType = z.infer<typeof ActivityAdResponseSchema>;
