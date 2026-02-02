import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { StoreSecretValueTypeSchema } from '../../../../common/secret/type';
import { CreateAppBodySchema, CreateAppResponseSchema } from '../common/api';
import { McpToolConfigSchema } from '../../../../core/app/tool/mcpTool/type';

// Create mcp tool
export const CreateMcpToolsBodySchema = CreateAppBodySchema.omit({
  type: true,
  modules: true,
  edges: true,
  chatConfig: true
})
  .extend({
    url: z.string().meta({
      example: 'https://example.com/mcp',
      description: 'MCP 服务地址'
    }),
    headerSecret: StoreSecretValueTypeSchema.optional().meta({
      example: { Authorization: { value: 'token', secret: '********' } },
      description: '请求头密钥'
    }),
    toolList: z.array(McpToolConfigSchema).meta({
      example: [
        {
          name: 'search',
          description: 'Search tool',
          inputSchema: { type: 'object', properties: {} }
        }
      ],
      description: 'MCP 工具列表'
    })
  })
  .meta({
    example: {
      name: 'MCP 工具集',
      parentId: '68ad85a7463006c963799a05',
      url: 'https://example.com/mcp',
      toolList: []
    }
  });
export type CreateMcpToolsBodyType = z.infer<typeof CreateMcpToolsBodySchema>;

export const CreateMcpToolsResponseSchema = CreateAppResponseSchema;
export type CreateMcpToolsResponseType = z.infer<typeof CreateMcpToolsResponseSchema>;

// Update mcp tool
export const UpdateMcpToolsBodySchema = z
  .object({
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: 'MCP 工具集 ID'
    }),
    url: CreateMcpToolsBodySchema.shape.url,
    headerSecret: CreateMcpToolsBodySchema.shape.headerSecret,
    toolList: CreateMcpToolsBodySchema.shape.toolList
  })
  .meta({
    example: {
      appId: '68ad85a7463006c963799a05',
      url: 'https://example.com/mcp',
      headerSecret: {},
      toolList: []
    }
  });
export type UpdateMcpToolsBodyType = z.infer<typeof UpdateMcpToolsBodySchema>;

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
