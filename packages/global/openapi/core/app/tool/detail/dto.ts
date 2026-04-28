import z from 'zod';

export const ToolDetailBodySchema = z.object({});

export const ToolDetailQuerySchema = z.object({
  /** 系统工具的 ID
   * - systemTool-xxxx
   * - systemTool-xxxx/childId
   * - comercial-xxxx,
   */
  id: z.string().meta({ description: '系统工具的 ID' }),
  version: z.string().optional().meta({ description: '系统工具的版本, 如果不填则返回最新版本' }),
  source: z.string().optional().meta({ description: '系统工具的来源，默认为 system' })
});

export const ToolDetailResponseSchema = z.object({
  // 基本信息
  id: z.string(),
  isToolSet: z.boolean().meta({ description: '是否为工具集' }),
  tags: z.array(z.string()).nullish().meta({ description: '系统工具的标签' }),
  avatar: z.string().optional().meta({ description: '系统工具的头像' }),
  name: z.string().meta({ description: '系统工具的名称' }),
  intro: z.string().optional().meta({ description: '系统工具的简介' }),
  author: z.string().optional().meta({ description: '系统工具的作者' }),

  instructions: z.string().optional().meta({ description: '使用说明 (文字)' }),
  courseUrl: z.string().optional().meta({ description: '系统工具的教程链接' }),
  readmeUrl: z.string().optional().meta({ description: '系统工具的 README 文档链接' }),

  // 输入输出

  // 计费相关
  /** 这个字段暂时没有用 */
  originCost: z.number().optional().meta({ description: '原始价格' }),
  currentCost: z.number().optional().meta({ description: '价格' }),
  hasTokenFee: z.boolean().optional().meta({ description: '是否配置了系统密钥' }),
  systemKeyCost: z.number().optional().meta({ description: '系统密钥费用' })
});

export type ToolDetailBodyType = z.infer<typeof ToolDetailBodySchema>;
export type ToolDetailQueryType = z.infer<typeof ToolDetailQuerySchema>;
export type ToolDetailResponseType = z.infer<typeof ToolDetailResponseSchema>;
