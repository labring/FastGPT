import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  SandboxFileOperationBodySchema,
  SandboxFileOperationResponseSchema,
  SandboxCheckExistBodySchema,
  SandboxCheckExistResponseSchema
} from './api';

export const SandboxPath: OpenAPIPath = {
  '/core/ai/sandbox/file': {
    post: {
      summary: '沙盒文件操作',
      description: '统一文件操作接口，支持列出目录（list）、读取文件（read）、写入文件（write）',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxFileOperationBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '操作成功',
          content: {
            'application/json': {
              schema: SandboxFileOperationResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/download': {
    post: {
      summary: '下载沙盒文件或目录',
      description: '将指定路径的文件或目录打包为 zip 并下载',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxCheckExistBodySchema.extend({
              path: SandboxFileOperationBodySchema.options[0].shape.path
            })
          }
        }
      },
      responses: {
        200: {
          description: '返回 zip 文件流',
          content: {
            'application/octet-stream': {
              schema: {
                type: 'string',
                format: 'binary'
              }
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/checkExist': {
    post: {
      summary: '检查沙盒是否存在',
      description: '根据 appId 和 chatId 检查对应的沙盒实例是否存在',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxCheckExistBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回沙盒是否存在',
          content: {
            'application/json': {
              schema: SandboxCheckExistResponseSchema
            }
          }
        }
      }
    }
  }
};
