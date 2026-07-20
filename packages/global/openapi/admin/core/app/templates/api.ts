import z from 'zod';

export const CreateTemplateBodySchema = z.object({
  name: z.string().meta({ description: '模板名称' }),
  intro: z.string().meta({ description: '模板简介' }),
  avatar: z.string().meta({ description: '模板头像URL' }),
  tags: z.array(z.string()).meta({ description: '模板标签列表' }),
  type: z.string().meta({ description: '模板类型' }),
  isActive: z.boolean().optional().meta({ description: '是否启用' }),
  isPromoted: z.boolean().optional().meta({ description: '是否推荐' }),
  promoteTags: z.array(z.string()).optional().meta({ description: '推荐标签' }),
  hideTags: z.array(z.string()).optional().meta({ description: '隐藏标签' }),
  recommendText: z.string().optional().meta({ description: '推荐文案' }),
  userGuide: z
    .object({
      type: z.enum(['markdown', 'link']).meta({ description: '用户引导类型' }),
      content: z.string().meta({ description: '用户引导内容' })
    })
    .optional()
    .meta({ description: '用户引导配置' }),
  workflow: z.any().meta({ description: '工作流模板配置' })
});

export const UpdateTemplateBodySchema = z.object({
  templateId: z.string().meta({ description: '模板ID' }),
  name: z.string().optional().meta({ description: '模板名称' }),
  intro: z.string().optional().meta({ description: '模板简介' }),
  avatar: z.string().optional().meta({ description: '模板头像URL' }),
  tags: z.array(z.string()).optional().meta({ description: '模板标签列表' }),
  type: z.string().optional().meta({ description: '模板类型' }),
  isActive: z.boolean().optional().meta({ description: '是否启用' }),
  isPromoted: z.boolean().optional().meta({ description: '是否推荐' }),
  promoteTags: z.array(z.string()).optional().meta({ description: '推荐标签' }),
  hideTags: z.array(z.string()).optional().meta({ description: '隐藏标签' }),
  recommendText: z.string().optional().meta({ description: '推荐文案' }),
  userGuide: z
    .object({
      type: z.enum(['markdown', 'link']).meta({ description: '用户引导类型' }),
      content: z.string().meta({ description: '用户引导内容' })
    })
    .optional()
    .meta({ description: '用户引导配置' }),
  workflow: z.any().optional().meta({ description: '工作流模板配置' }),
  author: z.string().optional().meta({ description: '作者' })
});

export const UpdateTemplateOrderBodySchema = z.object({
  templates: z
    .array(
      z.object({
        templateId: z.string().meta({ description: '模板ID' }),
        order: z.number().meta({ description: '排序值' })
      })
    )
    .meta({ description: '模板排序列表' })
});

export const UpdateQuickTemplateBodySchema = z.object({
  templateIds: z.array(z.string()).meta({ description: '设置为快捷模板的模板ID列表' })
});
