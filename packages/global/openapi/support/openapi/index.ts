import { type OpenAPIPath } from '../../type';
import {
  ApiKeyHealthParamsSchema,
  ApiKeyHealthErrorResponseSchema,
  ApiKeyHealthResponseSchema,
  CreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  DeleteApiKeyQuerySchema,
  DeleteApiKeyResponseSchema,
  GetApiKeyListQuerySchema,
  GetApiKeyListResponseSchema,
  UpdateApiKeyBodySchema,
  UpdateApiKeyResponseSchema
} from './api';
import { TagsMap } from '../../tag';

export const ApiKeyPath: OpenAPIPath = {
  '/support/openapi/create': {
    post: {
      summary: '创建 API Key',
      description: '创建团队级或应用级 API Key',
      tags: [TagsMap.apiKey],
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
      description: '获取团队级或指定应用下的 API Key 列表',
      tags: [TagsMap.apiKey],
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
      description: '更新 API Key 名称或使用限制',
      tags: [TagsMap.apiKey],
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
      description: '删除指定 API Key',
      tags: [TagsMap.apiKey],
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
  '/support/openapi/health': {
    get: {
      summary: '检查 API Key 是否健康',
      tags: [TagsMap.apiKey],
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
  }
};
