import z from 'zod';
import { BoolSchema, NumSchema } from '../../../../common/zod';
import { AppTypeEnum } from '../../../../core/app/constants';
import { AppTemplateSchema } from '../../../../core/app/type';

/* ============================================================================
 * API: 获取应用模板列表
 * Route: GET /api/core/app/template/list
 * Method: GET
 * Description: 获取应用模板市场列表，列表项不返回完整 workflow 内容。
 * Tags: ['模板管理']
 * ============================================================================ */

export const ListAppTemplateQuerySchema = z.object({
  isQuickTemplate: BoolSchema.optional().meta({
    example: false,
    description: '是否只查询快捷模板'
  }),
  randomNumber: NumSchema.optional().meta({
    example: 6,
    description: '随机返回数量'
  }),
  type: z
    .union([z.enum(AppTypeEnum), z.literal('all')])
    .optional()
    .meta({
      example: 'all',
      description: '应用类型'
    }),
  excludeIds: z.string().optional().meta({
    example: '["template-a","template-b"]',
    description: '需要排除的模板 ID JSON 字符串'
  })
});
export type ListAppTemplateQueryType = z.infer<typeof ListAppTemplateQuerySchema>;

export const AppTemplateListItemSchema = AppTemplateSchema.omit({
  workflow: true
}).extend({
  workflow: z.record(z.string(), z.never()).meta({
    description: '列表接口不返回完整 workflow，固定为空对象'
  })
});
export type AppTemplateListItemType = z.infer<typeof AppTemplateListItemSchema>;

export const ListAppTemplateResponseSchema = z.object({
  list: z.array(AppTemplateListItemSchema).meta({
    description: '模板列表'
  }),
  total: NumSchema.meta({
    example: 100,
    description: '模板总数'
  })
});
export type ListAppTemplateResponseType = z.infer<typeof ListAppTemplateResponseSchema>;

/* ============================================================================
 * API: 获取应用模板详情
 * Route: GET /api/core/app/template/detail
 * Method: GET
 * Description: 获取应用模板详情。
 * Tags: ['模板管理']
 * ============================================================================ */

export const GetAppTemplateDetailQuerySchema = z.object({
  templateId: z.string().min(1).meta({
    example: 'template-simple-chat',
    description: '模板 ID'
  })
});
export type GetAppTemplateDetailQueryType = z.infer<typeof GetAppTemplateDetailQuerySchema>;

export const GetAppTemplateDetailResponseSchema = AppTemplateSchema.optional().meta({
  description: '模板详情；未找到模板时为空'
});
export type GetAppTemplateDetailResponseType = z.infer<typeof GetAppTemplateDetailResponseSchema>;
