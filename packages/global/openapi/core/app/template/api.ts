import z from 'zod';
import { BoolSchema } from '../../../../common/zod';
import { AppTypeEnum } from '../../../../core/app/constants';
import type { AppTemplateSchemaType as CoreAppTemplateSchemaType } from '../../../../core/app/type';
import { UserTagsEnum } from '../../../../support/user/type';
import { WorkflowTemplateBasicTypeSchema } from '../../../../core/workflow/type';
import { OpenAPIStoreNodeItemTypeSchema } from '../../workflow/node';
import { OpenAPIAppChatConfigSchema, OpenAPIAppEdgesSchema } from '../common/api';

const OpenAPIWorkflowTemplateBasicTypeSchema = WorkflowTemplateBasicTypeSchema.omit({
  nodes: true
}).extend({
  nodes: z.array(OpenAPIStoreNodeItemTypeSchema).meta({
    description: '模板内置的工作流节点配置'
  }),
  edges: OpenAPIAppEdgesSchema.meta({
    description: '模板内置的工作流连线配置'
  }),
  chatConfig: OpenAPIAppChatConfigSchema.optional().meta({
    description: '模板默认对话配置'
  })
});

export const AppTemplateSchema = z.object({
  templateId: z.string().meta({ example: 'template-simple-chat', description: '模板 ID' }),
  name: z.string().meta({ example: '客服助手', description: '模板名称' }),
  intro: z.string().meta({ description: '模板介绍' }),
  avatar: z.string().meta({ description: '模板头像' }),
  tags: z.array(z.string()).meta({ description: '模板标签' }),
  type: z.string().meta({ example: AppTypeEnum.workflow, description: '应用类型' }),
  author: z.string().optional().meta({ description: '作者' }),
  isActive: z.boolean().optional().meta({ description: '是否启用' }),
  isPromoted: z.boolean().optional().meta({ description: '是否推荐' }),
  promoteTags: z.array(UserTagsEnum).optional().meta({ description: '推荐用户标签' }),
  hideTags: z.array(UserTagsEnum).optional().meta({ description: '隐藏用户标签' }),
  recommendText: z.string().optional().meta({ description: '推荐文案' }),
  userGuide: z
    .object({
      type: z.enum(['markdown', 'link']).meta({
        example: 'markdown',
        description: '用户指引展示方式'
      }),
      content: z.string().optional().meta({
        description: 'Markdown 类型用户指引内容'
      }),
      link: z.string().optional().meta({
        description: '外链类型用户指引地址'
      })
    })
    .optional()
    .meta({ description: '用户指引' }),
  isQuickTemplate: z.boolean().optional().meta({ description: '是否快捷模板' }),
  order: z.number().optional().meta({ description: '排序值' }),
  workflow: OpenAPIWorkflowTemplateBasicTypeSchema.meta({
    description: '模板对应的应用编排配置'
  })
});
export type AppTemplateSchemaType = z.infer<typeof AppTemplateSchema>;

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
  randomNumber: z.coerce.number().optional().meta({
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
  workflow: z
    .custom<CoreAppTemplateSchemaType['workflow']>(() => true)
    .meta({
      description: '列表接口不返回完整 workflow，固定为空对象'
    })
});
export const ListAppTemplateResponseSchema = z.object({
  list: z.array(AppTemplateListItemSchema).meta({
    description: '模板列表'
  }),
  total: z.number().meta({
    example: 100,
    description: '模板总数'
  })
}) as z.ZodType<{
  list: CoreAppTemplateSchemaType[];
  total: number;
}>;
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
