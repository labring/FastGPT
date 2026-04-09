import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  SandboxListBodySchema,
  SandboxListResponseSchema,
  SandboxWriteBodySchema,
  SandboxWriteResponseSchema,
  SandboxReadBodySchema,
  SandboxDownloadBodySchema,
  SandboxCheckExistBodySchema,
  SandboxCheckExistResponseSchema
} from './api';

export const SandboxPath: OpenAPIPath = {
  '/core/ai/sandbox/list': {
    post: {
      summary: '列出沙盒目录',
      description: '列出指定目录下的文件和子目录',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '目录内容',
          content: {
            'application/json': {
              schema: SandboxListResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/write': {
    post: {
      summary: '写入沙盒文件',
      description: '将内容写入指定路径的文件',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxWriteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '写入成功',
          content: {
            'application/json': {
              schema: SandboxWriteResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/read': {
    post: {
      summary: '读取沙盒文件内容',
      description: '读取文件内容并以对应 MIME 类型内联返回，适用于预览场景',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxReadBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '文件内容流',
          content: {
            '*/*': {
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

  '/core/ai/sandbox/download': {
    post: {
      summary: '下载沙盒文件或目录',
      description: '下载指定路径的文件，或将目录打包为 ZIP 下载',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxDownloadBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '文件流或 ZIP 包',
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
