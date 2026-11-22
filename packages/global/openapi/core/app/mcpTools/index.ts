import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { CreateAppResponseSchema } from '../common/api';
import {
  CreateMcpToolsBodySchema,
  GetMcpChildrenQuerySchema,
  GetMcpChildrenResponseSchema,
  UpdateMcpToolsBodySchema,
  UpdateMcpToolsResponseSchema,
  GetMcpToolsBodySchema,
  GetMcpToolsResponseSchema,
  RunMcpToolBodySchema,
  RunMcpToolResponseSchema
} from './api';
import {
  McpOAuthCallbackQuerySchema,
  McpOAuthCimdDocumentSchema,
  McpOAuthClientResetBodySchema,
  McpOAuthClientResetResponseSchema,
  McpOAuthDisconnectBodySchema,
  McpOAuthDisconnectResponseSchema,
  McpOAuthErrorResponseSchema,
  McpOAuthStartBodySchema,
  McpOAuthStartResponseSchema,
  McpOAuthStatusQuerySchema,
  McpOAuthStatusResponseSchema
} from './oauth';

export * from './oauth';

export const McpToolsPath: OpenAPIPath = {
  '/core/app/mcpTools/getTools': {
    post: {
      summary: '解析 MCP 工具列表',
      description: '解析 MCP 工具列表',
      tags: [DevApiTagsMap.mcpTools],
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
      tags: [DevApiTagsMap.mcpTools],
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
      tags: [DevApiTagsMap.mcpTools],
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
              schema: CreateAppResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/update': {
    put: {
      summary: '更新 MCP 工具集',
      description: '更新 MCP 工具集配置',
      tags: [DevApiTagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateMcpToolsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新 MCP 工具集',
          content: {
            'application/json': {
              schema: UpdateMcpToolsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/getChildren': {
    get: {
      summary: '获取 MCP 工具列表',
      description: '获取 MCP 工具集下的工具列表',
      tags: [DevApiTagsMap.mcpTools],
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
  },
  '/core/app/mcpTools/oauth/start': {
    post: {
      summary: '发起 MCP OAuth 授权',
      description:
        '按 CIMD → DCR → manual 解析 client 后返回授权地址；失败统一返回 OAuth 错误 envelope',
      tags: [DevApiTagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: McpOAuthStartBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功生成授权地址',
          content: {
            'application/json': {
              schema: McpOAuthStartResponseSchema
            }
          }
        },
        default: {
          description: 'OAuth 错误 envelope',
          content: {
            'application/json': {
              schema: McpOAuthErrorResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/oauth/callback': {
    get: {
      summary: 'MCP OAuth 回调',
      description:
        '校验 state 并换取 token；解密前失败返回错误 envelope，解密后失败 302 到固定详情页',
      tags: [DevApiTagsMap.mcpTools],
      requestParams: {
        query: McpOAuthCallbackQuerySchema
      },
      responses: {
        302: {
          description: '重定向到前端固定详情页（成功或可展示的失败）'
        },
        default: {
          description: 'OAuth 错误 envelope',
          content: {
            'application/json': {
              schema: McpOAuthErrorResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/oauth/status': {
    get: {
      summary: '查询 MCP OAuth 状态',
      description: '返回节点 OAuth 授权状态投影',
      tags: [DevApiTagsMap.mcpTools],
      requestParams: {
        query: McpOAuthStatusQuerySchema
      },
      responses: {
        200: {
          description: '成功获取 OAuth 状态',
          content: {
            'application/json': {
              schema: McpOAuthStatusResponseSchema
            }
          }
        },
        default: {
          description: 'OAuth 错误 envelope',
          content: {
            'application/json': {
              schema: McpOAuthErrorResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/oauth/disconnect': {
    post: {
      summary: '断开 MCP OAuth 授权',
      description: '撤销 token 并清理本地授权信息',
      tags: [DevApiTagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: McpOAuthDisconnectBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功断开授权',
          content: {
            'application/json': {
              schema: McpOAuthDisconnectResponseSchema
            }
          }
        },
        default: {
          description: 'OAuth 错误 envelope',
          content: {
            'application/json': {
              schema: McpOAuthErrorResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/oauth/client/reset': {
    post: {
      summary: '重置 MCP OAuth client',
      description: '按需注销并清空节点上的 client 信息',
      tags: [DevApiTagsMap.mcpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: McpOAuthClientResetBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功重置 client',
          content: {
            'application/json': {
              schema: McpOAuthClientResetResponseSchema
            }
          }
        },
        default: {
          description: 'OAuth 错误 envelope',
          content: {
            'application/json': {
              schema: McpOAuthErrorResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/mcpTools/oauth/client-metadata.json': {
    get: {
      summary: '获取 CIMD 客户端元数据文档',
      description: '公开的 Client ID Metadata Document；Host 必须匹配 FE_DOMAIN，支持 ETag/304',
      tags: [DevApiTagsMap.mcpTools],
      responses: {
        200: {
          description: 'CIMD 文档',
          content: {
            'application/json': {
              schema: McpOAuthCimdDocumentSchema
            }
          }
        },
        304: {
          description: 'ETag 匹配，未修改'
        },
        404: {
          description: 'Host 与 FE_DOMAIN 不匹配（空响应体）'
        },
        405: {
          description: '仅支持 GET/HEAD（空响应体，带 Allow 头）',
          headers: {
            Allow: {
              description: '允许的 HTTP 方法',
              schema: { type: 'string' }
            }
          }
        },
        default: {
          description: 'OAuth 错误 envelope',
          content: {
            'application/json': {
              schema: McpOAuthErrorResponseSchema
            }
          }
        }
      }
    }
  }
};
