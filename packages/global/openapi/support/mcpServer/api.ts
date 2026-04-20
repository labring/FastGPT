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
  apps: McpAppsBodySchema
});
export type McpCreateBodyType = z.infer<typeof McpCreateBodySchema>;

export const McpCreateResponseSchema = z.object({}).meta({ description: '创建成功' });
export type McpCreateResponseType = z.infer<typeof McpCreateResponseSchema>;

/* ============================================================================
 * API: 更新 MCP Server
 * Route: PUT /api/support/mcp/update
 * ============================================================================ */

export const McpUpdateBodySchema = z.object({
  id: ObjectIdSchema.meta({ description: 'MCP Server ID' }),
  name: McpNameSchema.optional(),
  apps: McpAppsBodySchema
});
export type McpUpdateBodyType = z.infer<typeof McpUpdateBodySchema>;

export const McpUpdateResponseSchema = z.object({}).meta({ description: '更新成功' });
export type McpUpdateResponseType = z.infer<typeof McpUpdateResponseSchema>;

/* ============================================================================
 * API: 删除 MCP Server
 * Route: DELETE /api/support/mcp/delete
 * ============================================================================ */

export const McpDeleteQuerySchema = z.object({
  id: ObjectIdSchema.meta({ description: '要删除的 MCP Server ID' })
});
export type McpDeleteQueryType = z.infer<typeof McpDeleteQuerySchema>;

export const McpDeleteResponseSchema = z.object({}).meta({ description: '删除成功' });
export type McpDeleteResponseType = z.infer<typeof McpDeleteResponseSchema>;
