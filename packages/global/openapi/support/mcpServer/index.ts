import { type OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import {
  McpCreateBodySchema,
  McpCreateResponseSchema,
  McpDeleteQuerySchema,
  McpDeleteResponseSchema,
  McpListResponseSchema,
  McpUpdateBodySchema,
  McpUpdateResponseSchema
} from './api';

export const McpPath: OpenAPIPath = {
  '/support/mcp/list': {
    get: {
      summary: '获取 MCP Server 列表',
      description: '获取当前团队(或个人)可见的 MCP Server 列表',
      tags: [TagsMap.mcpServer],
      responses: {
        200: {
          description: 'MCP Server 列表',
          content: {
            'application/json': {
              schema: McpListResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/mcp/create': {
    post: {
      summary: '创建 MCP Server',
      description: '创建一个新的 MCP Server,将若干应用以 MCP 工具的形式对外暴露',
      tags: [TagsMap.mcpServer],
      requestBody: {
        content: {
          'application/json': {
            schema: McpCreateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '创建成功',
          content: {
            'application/json': {
              schema: McpCreateResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/mcp/update': {
    put: {
      summary: '更新 MCP Server',
      description: '更新已存在的 MCP Server 名称或应用列表',
      tags: [TagsMap.mcpServer],
      requestBody: {
        content: {
          'application/json': {
            schema: McpUpdateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: McpUpdateResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/mcp/delete': {
    delete: {
      summary: '删除 MCP Server',
      description: '根据 ID 删除 MCP Server',
      tags: [TagsMap.mcpServer],
      requestParams: {
        query: McpDeleteQuerySchema
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: McpDeleteResponseSchema
            }
          }
        }
      }
    }
  }
};
