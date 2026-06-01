import z from 'zod';
import { PublishChannelEnum } from '../../../support/outLink/constant';
import { ObjectIdSchema } from '../../../common/type/mongo';

const OptionalDateSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date && Number.isNaN(value.getTime())) return undefined;
  return value;
}, z.coerce.date().optional());

const OutLinkLimitSchema = z
  .object({
    expiredTime: OptionalDateSchema.meta({ description: '过期时间' }),
    QPM: z.number().optional().default(1000).meta({ example: 60, description: '每分钟问题数限制' }),
    maxUsagePoints: z.number().optional().default(-1).meta({
      example: -1,
      description: '最大积分用量限制'
    }),
    hookUrl: z.string().optional().meta({ description: '校验消息回调地址' })
  })
  .meta({ description: '发布渠道限制配置' });

const OutLinkAppConfigSchema = z.any().optional().meta({
  description: '第三方平台配置，不同发布渠道结构不同'
});

export const OutLinkEditSchema = z.object({
  _id: ObjectIdSchema.optional().meta({ description: '发布渠道 ID，更新时必填' }),
  name: z.string().min(1).meta({ example: '公开访问链接', description: '发布渠道名称' }),
  showCite: z.boolean().optional().meta({ description: '是否显示引用' }),
  showRunningStatus: z.boolean().optional().meta({ description: '是否显示运行状态' }),
  showSkillReferences: z.boolean().optional().meta({ description: '是否显示技能引用' }),
  showFullText: z.boolean().optional().meta({ description: '是否显示全文' }),
  canDownloadSource: z.boolean().optional().meta({ description: '是否允许下载来源文件' }),
  immediateResponse: z.string().optional().meta({ description: '立即回复内容' }),
  defaultResponse: z.string().optional().meta({ description: '默认回复内容' }),
  limit: OutLinkLimitSchema.optional().meta({
    description: '发布渠道访问限制配置'
  }),
  app: OutLinkAppConfigSchema
});
export type OutLinkEditType = z.infer<typeof OutLinkEditSchema>;

export const OutLinkSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '发布渠道 ID' }),
  shareId: z.string().meta({ description: '发布渠道访问 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  appId: ObjectIdSchema.meta({ description: '应用 ID' }),
  name: z.string().meta({ description: '发布渠道名称' }),
  usagePoints: z.number().optional().default(0).meta({ description: '累计使用积分' }),
  lastTime: z.coerce.date().optional().meta({ description: '最后使用时间' }),
  type: z.enum(PublishChannelEnum).meta({ description: '发布渠道类型' }),
  showCite: z.boolean().optional().default(false).meta({ description: '是否显示引用' }),
  showRunningStatus: z
    .boolean()
    .optional()
    .default(false)
    .meta({ description: '是否显示运行状态' }),
  showSkillReferences: z
    .boolean()
    .optional()
    .default(false)
    .meta({ description: '是否显示技能引用' }),
  showFullText: z.boolean().optional().default(false).meta({ description: '是否显示全文' }),
  canDownloadSource: z.boolean().optional().default(false).meta({
    description: '是否允许下载来源文件'
  }),
  showWholeResponse: z.boolean().optional().default(true).meta({ description: '是否显示完整响应' }),
  immediateResponse: z.string().optional().meta({ description: '立即回复内容' }),
  defaultResponse: z.string().optional().meta({ description: '默认回复内容' }),
  limit: OutLinkLimitSchema.optional().meta({
    description: '发布渠道访问限制配置'
  }),
  app: OutLinkAppConfigSchema,
  responseDetail: z.boolean().optional().meta({ description: '已废弃：是否显示响应详情' }),
  showNodeStatus: z.boolean().optional().meta({ description: '已废弃：是否显示节点状态' }),
  showRawSource: z.boolean().optional().meta({ description: '已废弃：是否显示原始来源' })
});
export type OutLinkSchemaType = z.infer<typeof OutLinkSchema>;

// ============= OutLink List =============
export const OutLinkListQuerySchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  type: z.enum(PublishChannelEnum).meta({
    example: PublishChannelEnum.share,
    description: '发布渠道类型'
  })
});
export type OutLinkListQueryType = z.infer<typeof OutLinkListQuerySchema>;

export const OutLinkListResponseSchema = z.array(OutLinkSchema).meta({
  description: '发布渠道列表'
});
export type OutLinkListResponseType = z.infer<typeof OutLinkListResponseSchema>;

/* ============================================================================
 * API: 创建发布渠道
 * Route: POST /api/support/outLink/create
 * Method: POST
 * Description: 为指定应用创建发布渠道。
 * Tags: ['发布渠道']
 * ============================================================================ */

export const OutLinkCreateBodySchema = OutLinkEditSchema.omit({
  _id: true
}).extend({
  appId: ObjectIdSchema.meta({ description: '应用 ID' }),
  type: z.enum(PublishChannelEnum).meta({ description: '发布渠道类型' })
});
export type OutLinkCreateBodyType = z.infer<typeof OutLinkCreateBodySchema>;

export const OutLinkCreateResponseSchema = z.string().meta({
  description: '发布渠道 shareId'
});
export type OutLinkCreateResponseType = z.infer<typeof OutLinkCreateResponseSchema>;

/* ============================================================================
 * API: 更新发布渠道
 * Route: PUT /api/support/outLink/update
 * Method: PUT
 * Description: 更新发布渠道配置。
 * Tags: ['发布渠道']
 * ============================================================================ */

export const OutLinkUpdateBodySchema = OutLinkEditSchema.extend({
  _id: ObjectIdSchema.meta({ description: '发布渠道 ID' })
});
export type OutLinkUpdateBodyType = z.infer<typeof OutLinkUpdateBodySchema>;

export const OutLinkUpdateResponseSchema = z.string().meta({
  description: '发布渠道 shareId'
});
export type OutLinkUpdateResponseType = z.infer<typeof OutLinkUpdateResponseSchema>;

/* ============================================================================
 * API: 删除发布渠道
 * Route: DELETE /api/support/outLink/delete
 * Method: DELETE
 * Description: 删除指定发布渠道。
 * Tags: ['发布渠道']
 * ============================================================================ */

export const OutLinkDeleteQuerySchema = z.object({
  id: ObjectIdSchema.meta({ description: '发布渠道 ID' })
});
export type OutLinkDeleteQueryType = z.infer<typeof OutLinkDeleteQuerySchema>;

export const OutLinkDeleteBodySchema = z.object({}).meta({
  description: '删除发布渠道不需要请求体'
});
export type OutLinkDeleteBodyType = z.infer<typeof OutLinkDeleteBodySchema>;

export const OutLinkDeleteResponseSchema = z.undefined().meta({
  description: '删除成功'
});
export type OutLinkDeleteResponseType = z.infer<typeof OutLinkDeleteResponseSchema>;
