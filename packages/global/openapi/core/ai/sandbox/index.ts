import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  SandboxDownloadBodySchema,
  SandboxDownloadResponseSchema,
  SandboxCheckExistBodySchema,
  SandboxCheckExistResponseSchema,
  SandboxGetTicketBodySchema,
  SandboxGetTicketResponseSchema,
  SandboxGetHtmlPreviewLinkBodySchema,
  SandboxGetHtmlPreviewLinkResponseSchema
} from './api';

export const SandboxPath: OpenAPIPath = {
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
          content: {
            'application/octet-stream': {
              schema: SandboxDownloadResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/getHtmlPreviewLink': {
    post: {
      summary: '获取 HTML 文件预览链接',
      description: '返回用于在浏览器中预览 HTML 文件的链接（S3 托管）',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxGetHtmlPreviewLinkBodySchema
          }
        }
      },
      responses: {
        200: {
          description: 'HTML 预览链接',
          content: {
            'application/json': {
              schema: SandboxGetHtmlPreviewLinkResponseSchema
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
  },

  '/core/ai/sandbox/getTicket': {
    post: {
      summary: '获取沙盒 WebSocket 临时凭证',
      description: '鉴权并返回用于连接 agent-sandbox-proxy 的短期 ticket',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxGetTicketBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回沙盒 WebSocket 临时凭证',
          content: {
            'application/json': {
              schema: SandboxGetTicketResponseSchema
            }
          }
        }
      }
    }
  }
};
