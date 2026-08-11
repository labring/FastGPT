import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  SandboxDownloadBodyRawSchema,
  SandboxDownloadResponseSchema,
  SandboxUploadFileSchema,
  SandboxUploadQueryRawSchema,
  SandboxUploadResponseSchema,
  SandboxCheckExistBodyRawSchema,
  SandboxCheckExistResponseSchema,
  SandboxGetTicketBodyRawSchema,
  SandboxGetTicketResponseSchema,
  SandboxGetHtmlPreviewLinkBodyRawSchema,
  SandboxGetHtmlPreviewLinkResponseSchema,
  SandboxKeepaliveBodySchema,
  SandboxKeepaliveResponseSchema,
  SandboxProxyHeaderSchema,
  SandboxVerifyTicketDocumentQuerySchema,
  SandboxVerifyTicketHeaderSchema,
  SandboxVerifyTicketResponseSchema
} from './api';

export const SandboxPath: OpenAPIPath = {
  '/core/ai/sandbox/keepalive': {
    post: {
      summary: '刷新沙盒会话活跃时间',
      description: '仅供 agent-sandbox-proxy 内部调用，刷新指定沙盒实例的活跃时间',
      tags: [DevApiTagsMap.reverseInvokeSandbox],
      requestParams: {
        header: SandboxProxyHeaderSchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxKeepaliveBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功刷新沙盒会话活跃时间',
          content: {
            'application/json': {
              schema: SandboxKeepaliveResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/verifyTicket': {
    get: {
      summary: '校验沙盒访问凭证',
      description:
        '仅供 agent-sandbox-proxy 内部调用。ticket 查询参数与 x-sandbox-preview-session 请求头二选一，并且必须携带 x-proxy-token。',
      tags: [DevApiTagsMap.reverseInvokeSandbox],
      requestParams: {
        query: SandboxVerifyTicketDocumentQuerySchema,
        header: SandboxVerifyTicketHeaderSchema
      },
      responses: {
        200: {
          description: '成功返回沙盒连接信息和 WebSocket 限制',
          content: {
            'application/json': {
              schema: SandboxVerifyTicketResponseSchema
            }
          }
        }
      }
    }
  },

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
        '将原始二进制请求流直接写入当前 Chat Session 路径，不在 FastGPT 节点生成临时文件',
      tags: [DevApiTagsMap.sandbox],
      requestParams: {
        query: SandboxUploadQueryRawSchema
      },
      requestBody: {
        content: {
          'application/octet-stream': {
            schema: SandboxUploadFileSchema
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
      description:
        '校验文件后签发短期只读链接，由 agent-proxy 直接转发 sandbox workspace 内容，不复制到对象存储',
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
