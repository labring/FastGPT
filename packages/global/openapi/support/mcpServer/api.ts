import { z } from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

/* ============================================================================
 * 公共 Schema
 * ============================================================================ */

export const McpAppSchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  appName: z.string().max(200).optional().meta({
    example: '我的应用',
    description: '应用名称'
  }),
  toolName: z.string().min(1).max(100).meta({
    example: 'my_tool',
    description: '工具名称,在 MCP Server 中对外暴露的工具名'
  }),
  description: z.string().min(1).max(2000).meta({
    example: '这是一个工具描述',
    description: '工具描述'
  })
});
export type McpAppSchemaType = z.infer<typeof McpAppSchema>;

const McpAppsBodySchema = z.array(McpAppSchema).min(1).max(50).meta({
  description: 'MCP Server 下包含的工具应用列表(上限 50 个)'
});

const McpNameSchema = z.string().min(1).max(100).meta({
  example: '我的 MCP Server',
  description: 'MCP Server 名称'
});

/* ============================================================================
 * API: 获取 MCP Server 列表
 * Route: GET /api/support/mcp/list
 * ============================================================================ */

export const McpListResponseItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: 'MCP Server ID' }),
  name: z.string().meta({ description: 'MCP Server 名称' }),
  key: z.string().meta({ example: 'abcDEF123...', description: 'MCP Server 访问密钥' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  authProxy: z.boolean().default(false).meta({ description: '是否允许调用方代理团队成员身份' }),
  apps: z.array(McpAppSchema).meta({ description: '应用工具列表' })
});
export const McpListResponseSchema = z.array(McpListResponseItemSchema);
export type McpListResponseType = z.infer<typeof McpListResponseSchema>;

/* ============================================================================
 * API: 创建 MCP Server
 * Route: POST /api/support/mcp/create
 * ============================================================================ */

export const McpCreateBodySchema = z.object({
  name: McpNameSchema,
  authProxy: z.boolean().default(false).meta({
    description: '是否允许调用方代理团队成员身份，仅团队所有者可开启'
  }),
  apps: McpAppsBodySchema
});
export type McpCreateBodyType = z.infer<typeof McpCreateBodySchema>;

export const McpCreateResponseSchema = z.undefined().meta({ description: '创建成功' });
export type McpCreateResponseType = z.infer<typeof McpCreateResponseSchema>;

/* ============================================================================
 * API: 更新 MCP Server
 * Route: PUT /api/support/mcp/update
 * ============================================================================ */

export const McpUpdateBodySchema = z.object({
  id: ObjectIdSchema.meta({ description: 'MCP Server ID' }),
  name: McpNameSchema.optional(),
  authProxy: z.boolean().optional().meta({
    description: '是否允许调用方代理团队成员身份，仅团队所有者可开启'
  }),
  apps: McpAppsBodySchema
});
export type McpUpdateBodyType = z.infer<typeof McpUpdateBodySchema>;

export const McpUpdateResponseSchema = z.undefined().meta({ description: '更新成功' });
export type McpUpdateResponseType = z.infer<typeof McpUpdateResponseSchema>;

/* ============================================================================
 * API: 删除 MCP Server
 * Route: DELETE /api/support/mcp/delete
 * ============================================================================ */

export const McpDeleteQuerySchema = z.object({
  id: ObjectIdSchema.meta({ description: '要删除的 MCP Server ID' })
});
export type McpDeleteQueryType = z.infer<typeof McpDeleteQuerySchema>;

export const McpDeleteResponseSchema = z.undefined().meta({ description: '删除成功' });
export type McpDeleteResponseType = z.infer<typeof McpDeleteResponseSchema>;

/* ============================================================================
 * API: 获取 MCP Server 工具列表
 * Route: GET /api/support/mcp/server/toolList
 * Method: GET
 * Description: 通过 MCP Server 访问密钥获取当前发布的工具列表
 * Tags: ['MCP 发布管理', 'Read']
 * ============================================================================ */

export const McpServerToolListQuerySchema = z.object({
  key: z.string().min(1).meta({
    example: 'abcDEF123...',
    description: 'MCP Server 访问密钥'
  })
});
export type McpServerToolListQuery = z.infer<typeof McpServerToolListQuerySchema>;

const McpServerToolInputSchema = z
  .object({
    type: z.literal('object').meta({
      example: 'object',
      description: '工具输入 Schema 的根类型'
    }),
    properties: z
      .record(z.string(), z.any())
      .optional()
      .meta({
        example: { question: { type: 'string', description: 'Question from user' } },
        description: '工具输入字段的 JSON Schema 定义'
      }),
    required: z
      .array(z.string())
      .optional()
      .meta({
        example: ['question'],
        description: '必填输入字段名称列表'
      })
  })
  .catchall(z.any())
  .meta({ description: 'MCP 工具输入 JSON Schema' });

export const McpServerToolSchema = z
  .object({
    name: z.string().meta({
      example: 'search_knowledge',
      description: 'MCP 工具名称'
    }),
    description: z.string().optional().meta({
      example: '搜索指定知识库并返回相关内容',
      description: 'MCP 工具能力描述'
    }),
    inputSchema: McpServerToolInputSchema
  })
  .catchall(z.any());

export const McpServerToolListResponseSchema = z.array(McpServerToolSchema).meta({
  description: '当前 MCP Server 发布的工具列表'
});
export type McpServerToolListResponse = z.infer<typeof McpServerToolListResponseSchema>;

/* ============================================================================
 * API: 调用 MCP Server 工具
 * Route: POST /api/support/mcp/server/toolCall
 * Method: POST
 * Description: 通过 MCP Server 访问密钥调用指定工具并返回文本结果
 * Tags: ['MCP 发布管理', 'Write']
 * ============================================================================ */

export const McpServerToolCallBodySchema = z.object({
  key: z.string().min(1).meta({
    example: 'abcDEF123...',
    description: 'MCP Server 访问密钥'
  }),
  toolName: z.string().min(1).meta({
    example: 'search_knowledge',
    description: '需要调用的 MCP 工具名称'
  }),
  inputs: z.record(z.string(), z.any()).meta({
    example: { question: 'FastGPT 如何创建知识库？' },
    description: '传递给工具的输入参数，需符合工具 inputSchema'
  })
});
export type McpServerToolCallBody = z.infer<typeof McpServerToolCallBodySchema>;

export const McpServerToolCallResponseSchema = z.string().meta({
  example: '可以在知识库页面点击“新建知识库”完成创建。',
  description: 'MCP 工具执行后的文本结果'
});
export type McpServerToolCallResponse = z.infer<typeof McpServerToolCallResponseSchema>;
export const McpAuthProxySchema = z
  .object({
    username: z.string().trim().min(1).max(128).optional().meta({
      example: 'user@example.com',
      description: '代理调用的团队成员用户名'
    }),
    tmbId: ObjectIdSchema.optional().meta({
      description: '代理调用的团队成员 ID'
    })
  })
  .refine(({ username, tmbId }) => !!username || !!tmbId, {
    message: 'authProxy.username or authProxy.tmbId is required'
  });
export type McpAuthProxyType = z.infer<typeof McpAuthProxySchema>;
