import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  CreateMcpToolsBodySchema,
  CreateMcpToolsResponseSchema,
  GetMcpChildrenQuerySchema,
  GetMcpChildrenResponseSchema,
  UpdateMcpToolsBodySchema,
  GetMcpToolsBodySchema,
  GetMcpToolsResponseSchema,
  RunMcpToolBodySchema,
  RunMcpToolResponseSchema
} from './api';

export const McpToolsPath: OpenAPIPath = {
  '/core/app/mcpTools/getTools': {
    post: {
      summary: '解析 MCP 工具列表',
      description: '解析 MCP 工具列表',
      tags: [TagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: GetMcpToolsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功解析 MCP 工具列表',
          content: {
            'application/json': {
              schema: GetMcpToolsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/runTool': {
    post: {
      summary: '运行 MCP 工具',
      description: '运行 MCP 工具',
      tags: [TagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: RunMcpToolBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功运行 MCP 工具',
          content: {
            'application/json': {
              schema: RunMcpToolResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/create': {
    post: {
      summary: '创建 MCP 工具集',
      description: '创建 MCP 工具集应用',
      tags: [TagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateMcpToolsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建 MCP 工具集',
          content: {
            'application/json': {
              schema: CreateMcpToolsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/update': {
    post: {
      summary: '更新 MCP 工具集',
      description: '更新 MCP 工具集配置',
      tags: [TagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateMcpToolsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新 MCP 工具集'
        }
      }
    }
  },
  '/core/app/mcpTools/getChildren': {
    get: {
      summary: '获取 MCP 工具列表',
      description: '获取 MCP 工具集下的工具列表',
      tags: [TagsMap.mcpTools],
      requestParams: {
        query: GetMcpChildrenQuerySchema
      },
      responses: {
        200: {
          description: '成功获取 MCP 工具列表',
          content: {
            'application/json': {
              schema: GetMcpChildrenResponseSchema
            }
          }
        }
      }
    }
  }
};
