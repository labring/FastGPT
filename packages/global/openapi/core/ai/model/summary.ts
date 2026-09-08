import { z } from 'zod';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';

/* ============================================================================
 * API: 批量获取模型展示详情
 * Route: POST /api/core/ai/model/summary
 * Method: POST
 * Description: 返回当前身份对应模型名称、图标和可用状态，不返回执行配置或凭据
 * Tags: ['AI 通用', 'Read']
 * ============================================================================ */

export const GetModelSummariesBodySchema = z.object({
  modelIds: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(100)
    .meta({
      description: '待查询的稳定模型 ID，最多 100 个',
      example: ['68ad85a7463006c963799a01']
    }),
  outLinkAuthData: OutLinkChatAuthSchema.optional().meta({
    description: '外链鉴权数据，使用发布者身份计算权限',
    example: { shareId: 'share-id', outLinkUid: 'out-link-user-id' }
  })
});
export type GetModelSummariesBody = z.infer<typeof GetModelSummariesBodySchema>;

const DisplayModelIdentitySchema = z.object({
  modelId: z.string().meta({ description: '模型稳定 ID', example: '68ad85a7463006c963799a01' })
});

export const ModelSummarySchema = z.discriminatedUnion('status', [
  DisplayModelIdentitySchema.extend({
    status: z.literal('deleted').meta({ description: '模型不存在' })
  }),
  DisplayModelIdentitySchema.extend({
    name: z.string().meta({ description: '模型展示名称；无权限时也用于提示', example: 'GPT-5' }),
    avatar: z
      .string()
      .optional()
      .meta({ description: '模型 logo 地址', example: '/icon/logo.svg' }),
    status: z.enum(['active', 'disabled', 'forbidden']).meta({
      description: '当前身份的可用状态；无权限优先于停用',
      example: 'active'
    })
  })
]);
export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export const GetModelSummariesResponseSchema = z.object({
  models: z.array(ModelSummarySchema).meta({ description: '按请求顺序返回的模型展示详情' })
});
export type GetModelSummariesResponse = z.infer<typeof GetModelSummariesResponseSchema>;
