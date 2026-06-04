import z from 'zod';

export const SystemToolListItemSchema = z.object({
  // 基础信息
  id: z.string().meta({ description: '系统工具的 ID' }),
  isToolSet: z.boolean().meta({ description: '是否为工具集' }),
  avatar: z.string().meta({ description: '工具的图标' }),
  name: z.string().meta({ description: '工具的名称' }),
  intro: z.string().meta({ description: '工具的简介' }),
  author: z.string().meta({ description: '工具的作者' }),
  tags: z.array(z.string()).meta({ description: '工具的标签' }),

  // 计费相关
  currentCost: z.number().meta({ description: '当前使用的费用' }),
  systemKeyCost: z.number().meta({ description: '系统密钥的费用' }),
  hasTokenFee: z.boolean().meta({ description: '是否有系统密钥费用' })
});

export const SystemToolListBodySchema = z.object({
  searchKey: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export const SystemToolListQuerySchema = z.object({});

export const SystemToolListResponseSchema = z.array(SystemToolListItemSchema);

export type SystemToolListBodyType = z.infer<typeof SystemToolListBodySchema>;
export type SystemToolListQueryType = z.infer<typeof SystemToolListQuerySchema>;
export type SystemToolListResponseType = z.infer<typeof SystemToolListResponseSchema>;
