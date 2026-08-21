import { type OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  McpCreateBodySchema,
  McpCreateResponseSchema,
  McpDeleteQuerySchema,
  McpDeleteResponseSchema,
  McpListResponseSchema,
  McpServerToolCallBodySchema,
  McpServerToolCallResponseSchema,
  McpServerToolListQuerySchema,
  McpServerToolListResponseSchema,
  McpUpdateBodySchema,
  McpUpdateResponseSchema
} from './api';

export const McpPath: OpenAPIPath = {
  '/support/mcp/list': {
    get: {
      summary: '获取 MCP Server 列表',
      description: '获取当前团队(或个人)可见的 MCP Server 列表',
      tags: [DevApiTagsMap.mcpServer],
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
      tags: [DevApiTagsMap.mcpServer],
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
      tags: [DevApiTagsMap.mcpServer],
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
      tags: [DevApiTagsMap.mcpServer],
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
  },
  '/support/mcp/server/toolList': {
    get: {
      summary: '获取 MCP Server 工具列表',
      description: '通过 MCP Server 访问密钥获取当前发布的工具列表',
      tags: [DevApiTagsMap.mcpServer],
      requestParams: {
        query: McpServerToolListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回 MCP 工具列表',
          content: {
            'application/json': {
              schema: McpServerToolListResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/mcp/server/toolCall': {
    post: {
      summary: '调用 MCP Server 工具',
      description: '通过 MCP Server 访问密钥调用指定工具并返回文本结果',
      tags: [DevApiTagsMap.mcpServer],
      requestBody: {
        content: {
          'application/json': {
            schema: McpServerToolCallBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回 MCP 工具执行结果',
          content: {
            'application/json': {
              schema: McpServerToolCallResponseSchema
            }
          }
        }
      }
    }
  }
};
