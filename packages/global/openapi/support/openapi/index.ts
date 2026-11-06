import { type OpenAPIPath } from '../../type';
import {
  ApiKeyHealthParamsSchema,
  ApiKeyHealthErrorResponseSchema,
  ApiKeyHealthResponseSchema,
  CopyApiKeyBodySchema,
  CopyApiKeyResponseSchema,
  CreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  DeleteApiKeyQuerySchema,
  DeleteApiKeyResponseSchema,
  GetApiKeyListQuerySchema,
  GetApiKeyListResponseSchema,
  UpdateApiKeyBodySchema,
  UpdateApiKeyResponseSchema
} from './api';
import {
  CreateOpenApiTagBodySchema,
  CreateOpenApiTagResponseSchema,
  DeleteOpenApiTagQuerySchema,
  DeleteOpenApiTagResponseSchema,
  GetOpenApiTagListQuerySchema,
  GetOpenApiTagListResponseSchema,
  UpdateOpenApiTagBodySchema,
  UpdateOpenApiTagResponseSchema
} from './tag';
import { DevApiTagsMap } from '../../tag';

export const ApiKeyPath: OpenAPIPath = {
  '/support/openapi/create': {
    post: {
      summary: '创建 API Key',
      description:
        '登录后创建 API Key：个人密钥要求团队创建权限；应用 Key 仅对应应用管理员可创建。',
      tags: [DevApiTagsMap.apiKey],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateApiKeyBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建 API Key',
          content: {
            'application/json': {
              schema: CreateApiKeyResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/list': {
    get: {
      summary: '获取 API Key 列表',
      description:
        '个人密钥仅查看本人；应用 Key 仅应用管理员可查看，返回该应用全部管理员创建的 Key。',
      tags: [DevApiTagsMap.apiKey],
      requestParams: {
        query: GetApiKeyListQuerySchema
      },
      responses: {
        200: {
          description: '成功获取 API Key 列表',
          content: {
            'application/json': {
              schema: GetApiKeyListResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/update': {
    put: {
      summary: '更新 API Key',
      description: '更新 API Key 名称或使用限制；应用管理员可修改该应用下其他管理员创建的 Key。',
      tags: [DevApiTagsMap.apiKey],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateApiKeyBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新 API Key',
          content: {
            'application/json': {
              schema: UpdateApiKeyResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/delete': {
    delete: {
      summary: '删除 API Key',
      description: '删除指定 API Key；应用管理员可删除该应用下其他管理员创建的 Key。',
      tags: [DevApiTagsMap.apiKey],
      requestParams: {
        query: DeleteApiKeyQuerySchema
      },
      responses: {
        200: {
          description: '成功删除 API Key',
          content: {
            'application/json': {
              schema: DeleteApiKeyResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/copy': {
    post: {
      summary: '复制 API Key',
      description:
        '返回 API Key 明文并记录复制审计；应用管理员可复制该应用下其他管理员创建的 Key。',
      tags: [DevApiTagsMap.apiKey],
      requestBody: {
        content: {
          'application/json': {
            schema: CopyApiKeyBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功复制 API Key',
          content: {
            'application/json': {
              schema: CopyApiKeyResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/health': {
    get: {
      summary: '检查 API Key 是否健康',
      tags: [DevApiTagsMap.apiKey],
      requestParams: {
        query: ApiKeyHealthParamsSchema
      },
      responses: {
        200: {
          description: 'API Key 可用',
          content: {
            'application/json': {
              schema: ApiKeyHealthResponseSchema
            }
          }
        },
        500: {
          description: 'ApiKey错误',
          content: {
            'application/json': {
              schema: ApiKeyHealthErrorResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/tag/list': {
    get: {
      summary: '获取 API Key 标签列表',
      description: '获取当前登录成员的 API Key 标签列表',
      tags: [DevApiTagsMap.apiKey],
      requestParams: {
        query: GetOpenApiTagListQuerySchema
      },
      responses: {
        200: {
          description: '成功获取 API Key 标签列表',
          content: {
            'application/json': {
              schema: GetOpenApiTagListResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/tag/create': {
    post: {
      summary: '创建 API Key 标签',
      description: '创建当前登录成员的 API Key 自定义标签',
      tags: [DevApiTagsMap.apiKey],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateOpenApiTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建 API Key 标签',
          content: {
            'application/json': {
              schema: CreateOpenApiTagResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/tag/update': {
    put: {
      summary: '更新 API Key 标签',
      description: '更新当前登录成员的 API Key 标签',
      tags: [DevApiTagsMap.apiKey],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateOpenApiTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新 API Key 标签',
          content: {
            'application/json': {
              schema: UpdateOpenApiTagResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/openapi/tag/delete': {
    delete: {
      summary: '删除 API Key 标签',
      description: '删除当前登录成员的 API Key 自定义标签，并从 API Key 绑定中解绑',
      tags: [DevApiTagsMap.apiKey],
      requestParams: {
        query: DeleteOpenApiTagQuerySchema
      },
      responses: {
        200: {
          description: '成功删除 API Key 标签',
          content: {
            'application/json': {
              schema: DeleteOpenApiTagResponseSchema
            }
          }
        }
      }
    }
  }
};
