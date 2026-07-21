import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  SandboxDownloadBodyRawSchema,
  SandboxDownloadResponseSchema,
  SandboxUploadMultipartSchema,
  SandboxUploadResponseSchema,
  SandboxCheckExistBodyRawSchema,
  SandboxCheckExistResponseSchema,
  SandboxGetTicketBodyRawSchema,
  SandboxGetTicketResponseSchema,
  SandboxGetHtmlPreviewLinkBodyRawSchema,
  SandboxGetHtmlPreviewLinkResponseSchema
} from './api';

export const SandboxPath: OpenAPIPath = {
  '/core/ai/sandbox/download': {
    post: {
      summary: '下载沙盒文件或目录',
      description: '下载当前 Chat Session 中的指定文件，或将目录打包为 ZIP 下载',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxDownloadBodyRawSchema
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

  '/core/ai/sandbox/upload': {
    post: {
      summary: '上传文件到沙盒',
      description:
        '通过 multipart/form-data 上传文件，并写入当前 Chat Session 路径。`file` 字段为二进制文件，`data` 字段为 JSON 序列化后的上传参数对象',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: SandboxUploadMultipartSchema,
            encoding: {
              data: { contentType: 'application/json' }
            }
          }
        }
      },
      responses: {
        200: {
          description: '上传结果',
          content: {
            'application/json': {
              schema: SandboxUploadResponseSchema
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
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxGetHtmlPreviewLinkBodyRawSchema
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
      description: '根据 Chat 目标和有效用户检查对应的用户级沙盒实例是否存在',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxCheckExistBodyRawSchema
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
      description: '鉴权并返回用于连接 agent-sandbox-proxy 的短期 ticket 和当前会话目录',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxGetTicketBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '返回沙盒 WebSocket 临时凭证和运行时目录',
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
