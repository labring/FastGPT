import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  CreateHttpToolsBodySchema,
  CreateHttpToolsResponseSchema,
  UpdateHttpToolsBodySchema,
  GetApiSchemaByUrlBodySchema,
  GetApiSchemaByUrlResponseSchema,
  RunHttpToolBodySchema,
  RunHttpToolResponseSchema
} from './api';

export const HttpToolsPath: OpenAPIPath = {
  '/core/app/httpTools/create': {
    post: {
      summary: '创建 HTTP 工具集',
      description: '创建 HTTP 工具集应用',
      tags: [TagsMap.httpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateHttpToolsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建 HTTP 工具集',
          content: {
            'application/json': {
              schema: CreateHttpToolsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/httpTools/update': {
    post: {
      summary: '更新 HTTP 工具集',
      description: '更新 HTTP 工具集配置',
      tags: [TagsMap.httpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateHttpToolsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新 HTTP 工具集'
        }
      }
    }
  },
  '/core/app/httpTools/getApiSchemaByUrl': {
    post: {
      summary: '通过 URL 解析 OpenAPI Schema',
      description: '根据远程 OpenAPI Schema URL 解析并返回结构化的 Schema 对象',
      tags: [TagsMap.httpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: GetApiSchemaByUrlBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功解析 OpenAPI Schema',
          content: {
            'application/json': {
              schema: GetApiSchemaByUrlResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/httpTools/runTool': {
    post: {
      summary: '运行 HTTP 工具',
      description: '运行 HTTP 工具并返回调用结果',
      tags: [TagsMap.httpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: RunHttpToolBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功运行 HTTP 工具',
          content: {
            'application/json': {
              schema: RunHttpToolResponseSchema
            }
          }
        }
      }
    }
  }
};
