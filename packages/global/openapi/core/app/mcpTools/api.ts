import z from 'zod';
import { OpenObjectOpenApiMeta } from '../../../../common/zod/openapi';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { StoreSecretValueTypeApiInputSchema } from '../../../../common/secret/utils';
import { CreateAppBodySchema } from '../common/api';
import { McpToolConfigSchema } from '../../../../core/app/tool/mcpTool/type';
import {
  McpOAuthAuthModeSchema,
  McpOAuthClientModeSchema
} from '../../../../core/app/tool/mcpTool/oauth';

// Create mcp tool
export const CreateMcpToolsBodySchema = CreateAppBodySchema.omit({
  type: true,
  nodes: true,
  edges: true,
  chatConfig: true
})
  .extend({
    url: z.string().meta({
      example: 'https://example.com/mcp',
      description: 'MCP 服务地址'
    }),
    authMode: McpOAuthAuthModeSchema.default('headers').meta({
      description: '鉴权模式；oauth 时运行期忽略 headerSecret'
    }),
    clientMode: McpOAuthClientModeSchema.optional().meta({
      description: 'OAuth client 偏好；auto 固定 CIMD → DCR → manual'
    }),
    scope: z.string().max(1024).optional().meta({
      description: 'OAuth 请求 scope；默认未设置'
    }),
    headerSecret: StoreSecretValueTypeApiInputSchema.optional().meta({
      example: { Authorization: { value: 'token' } },
      description: '请求头密钥'
    }),
    toolList: z
      .array(McpToolConfigSchema)
      .default([])
      .meta({
        example: [
          {
            name: 'search',
            description: 'Search tool',
            inputSchema: { type: 'object', properties: {} }
          }
        ],
        description: 'MCP 工具列表；oauth 模式允许为空'
      })
  })
  .meta({
    example: {
      name: 'MCP 工具集',
      parentId: '68ad85a7463006c963799a05',
      url: 'https://example.com/mcp',
      authMode: 'oauth',
      toolList: []
    }
  })
  .refine((data) => data.authMode === 'oauth' || data.toolList.length > 0, {
    message: 'authMode=headers 时 toolList 不能为空',
    path: ['toolList']
  });
export type CreateMcpToolsBodyType = z.infer<typeof CreateMcpToolsBodySchema>;

// Update mcp tool
export const UpdateMcpToolsBodySchema = z
  .object({
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: 'MCP 工具集 ID'
    }),
    url: CreateMcpToolsBodySchema.shape.url,
    authMode: McpOAuthAuthModeSchema.optional().meta({
      description: '鉴权模式；oauth 时运行期忽略 headerSecret'
    }),
    clientMode: McpOAuthClientModeSchema.optional().meta({
      description: 'OAuth client 偏好；auto 固定 CIMD → DCR → manual'
    }),
    scope: z.string().max(1024).optional().meta({
      description: 'OAuth 请求 scope；默认未设置'
    }),
    headerSecret: CreateMcpToolsBodySchema.shape.headerSecret,
    toolList: z.array(McpToolConfigSchema).meta({
      description: 'MCP 工具列表'
    })
  })
  .meta({
    example: {
      appId: '68ad85a7463006c963799a05',
      url: 'https://example.com/mcp',
      headerSecret: {},
      toolList: []
    }
  })
  // 与创建路径保持同一不变量；authMode 省略时由 update handler 从存量节点解析。
  .refine((data) => data.authMode !== 'headers' || data.toolList.length > 0, {
    message: 'authMode=headers 时 toolList 不能为空',
    path: ['toolList']
  });
export type UpdateMcpToolsBodyType = z.infer<typeof UpdateMcpToolsBodySchema>;

export const UpdateMcpToolsResponseSchema = z.undefined().meta({
  description: '更新成功'
});
export type UpdateMcpToolsResponseType = z.infer<typeof UpdateMcpToolsResponseSchema>;

// Get mcp children
export const GetMcpChildrenQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: 'MCP 工具集 ID'
  }),
  searchKey: z.string().optional().meta({
    example: 'search',
    description: '工具名称搜索关键词'
  })
});
export type GetMcpChildrenQueryType = z.infer<typeof GetMcpChildrenQuerySchema>;

export const McpChildrenItemSchema = McpToolConfigSchema.extend({
  id: z.string().meta({
    example: 'mcp-68ad85a7463006c963799a05/search',
    description: '工具 ID'
  }),
  avatar: z.string().meta({
    example: 'https://example.com/avatar.png',
    description: '工具头像'
  })
});
export type McpChildrenItemType = z.infer<typeof McpChildrenItemSchema>;

export const GetMcpChildrenResponseSchema = z.array(McpChildrenItemSchema).meta({
  example: [],
  description: 'MCP 工具列表'
});
export type GetMcpChildrenResponseType = z.infer<typeof GetMcpChildrenResponseSchema>;

// Get MCP tools from remote server
export const GetMcpToolsBodySchema = z
  .object({
    appId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: 'MCP 工具集 App ID；存在时按节点配置解析'
    }),
    nodeId: z.string().min(1).max(64).optional().meta({
      description: '工具集节点 ID；缺省时要求应用内唯一 toolSet 节点'
    }),
    url: z.string().optional().meta({
      example: 'https://example.com/mcp',
      description: 'MCP 服务地址；未传 appId 时必填'
    }),
    headerSecret: StoreSecretValueTypeApiInputSchema.optional().meta({
      example: { Authorization: { value: 'token' } },
      description: '请求头密钥'
    })
  })
  .meta({
    example: {
      url: 'https://example.com/mcp',
      headerSecret: {}
    }
  })
  .refine((data) => Boolean(data.appId) || Boolean(data.url), {
    message: 'appId 与 url 至少提供一个',
    path: ['url']
  })
  .refine((data) => !data.nodeId || Boolean(data.appId), {
    message: 'nodeId 必须与 appId 一起使用',
    path: ['nodeId']
  });
export type GetMcpToolsBodyType = z.infer<typeof GetMcpToolsBodySchema>;

export const GetMcpToolsResponseSchema = z.array(McpToolConfigSchema).meta({
  example: [],
  description: 'MCP 工具配置列表'
});
export type GetMcpToolsResponseType = z.infer<typeof GetMcpToolsResponseSchema>;

// Run MCP tool
export const RunMcpToolBodySchema = z
  .object({
    appId: ObjectIdSchema.optional().meta({
      example: '68ad85a7463006c963799a05',
      description: 'MCP 工具集 App ID；存在时按节点配置解析'
    }),
    nodeId: z.string().min(1).max(64).optional().meta({
      description: '工具集节点 ID；缺省时要求应用内唯一 toolSet 节点'
    }),
    url: z.string().optional().meta({
      example: 'https://example.com/mcp',
      description: 'MCP 服务地址；未传 appId 时必填'
    }),
    toolName: z.string().meta({
      example: 'search',
      description: '工具名称'
    }),
    headerSecret: StoreSecretValueTypeApiInputSchema.optional().meta({
      example: { Authorization: { value: 'token' } },
      description: '请求头密钥'
    }),
    params: z.record(z.string(), z.any()).meta({
      example: { query: 'hello' },
      description: '工具调用参数'
    })
  })
  .meta({
    example: {
      url: 'https://example.com/mcp',
      toolName: 'search',
      headerSecret: {},
      params: { query: 'hello' }
    }
  })
  .refine((data) => Boolean(data.appId) || Boolean(data.url), {
    message: 'appId 与 url 至少提供一个',
    path: ['url']
  })
  .refine((data) => !data.nodeId || Boolean(data.appId), {
    message: 'nodeId 必须与 appId 一起使用',
    path: ['nodeId']
  });
export type RunMcpToolBodyType = z.infer<typeof RunMcpToolBodySchema>;

export const RunMcpToolResponseSchema = z.any().meta({
  ...OpenObjectOpenApiMeta,
  description: '工具调用结果（MCP CallToolResult 结构，内容随工具变化）'
});
export type RunMcpToolResponseType = z.infer<typeof RunMcpToolResponseSchema>;
