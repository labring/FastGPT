import z from 'zod';
import { IntSchema } from '../../../../common/zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { ModelIdsSchema } from '../../../core/ai/model/api';
import {
  InformLevelEnum,
  ModelDeprecationInformChannelEnum,
  ModelDeprecationInformJobStatusEnum
} from '../../../../support/user/inform/constants';

export const ModelDeprecationInformChannelSchema = z.enum(ModelDeprecationInformChannelEnum).meta({
  description: '通知渠道',
  example: 'email'
});
export type ModelDeprecationInformChannelType = z.infer<typeof ModelDeprecationInformChannelSchema>;

const ModelDeprecationInformJobStatusSchema = z.enum(ModelDeprecationInformJobStatusEnum);

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
    description: '计划下架日期，服务端按自身时区解释为该日 00:00',
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

export const ModelDeprecationInformHistoryJobSchema = z.object({
  scheduledAt: z.string().datetime().meta({
    description: '计划发送时间',
    example: '2026-10-30T00:00:00.000Z'
  }),
  channels: z.array(ModelDeprecationInformChannelSchema).meta({
    description: '本轮发送渠道',
    example: ['email']
  }),
  status: ModelDeprecationInformJobStatusSchema.meta({
    description: '本轮状态',
    example: 'scheduled'
  }),
  completedAt: z.string().datetime().optional().meta({
    description: '扫描完成时间',
    example: '2026-10-30T00:01:00.000Z'
  }),
  skippedAt: z.string().datetime().optional().meta({
    description: '跳过时间',
    example: '2026-10-30T00:00:00.000Z'
  }),
  failedAt: z.string().datetime().optional().meta({
    description: '整轮失败时间',
    example: '2026-10-30T00:01:00.000Z'
  }),
  failedTeamCount: IntSchema.meta({ description: '至少一个发送渠道失败的团队数', example: 0 })
});
export type ModelDeprecationInformHistoryJobType = z.infer<
  typeof ModelDeprecationInformHistoryJobSchema
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
  plannedDeprecationAt: z.string().datetime().meta({
    description: '计划下架时间，由服务端时区下的零点转换为 ISO-8601',
    example: '2026-12-31T00:00:00.000Z'
  }),
  createdAt: z.string().datetime().meta({
    description: '通知计划创建时间',
    example: '2026-10-29T00:00:00.000Z'
  }),
  jobs: z.array(ModelDeprecationInformHistoryJobSchema).meta({
    description: '通知轮次',
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
