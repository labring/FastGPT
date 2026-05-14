import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  SandboxListBodySchema,
  SandboxListResponseSchema,
  SandboxWriteBodySchema,
  SandboxWriteResponseSchema,
  SandboxReadBodySchema,
  SandboxReadResponseSchema,
  SandboxDownloadBodySchema,
  SandboxDownloadResponseSchema,
  SandboxCheckExistBodySchema,
  SandboxCheckExistResponseSchema,
  SandboxGetHtmlPreviewLinkBodySchema,
  SandboxGetHtmlPreviewLinkResponseSchema,
  SandboxProxyTokenBodySchema,
  SandboxProxyTokenResponseSchema,
  SandboxHeartbeatBodySchema,
  SandboxHeartbeatResponseSchema,
  SandboxProxyTargetBodySchema,
  SandboxProxyTargetResponseSchema
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
          content: {
            '*/*': {
              schema: SandboxReadResponseSchema
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

  '/core/sandbox/proxy/token': {
    post: {
      summary: '签发 sandbox-proxy 访问 token',
      description: '为已授权用户签发访问 sandbox-proxy 指定 sandbox 服务的短期 JWT',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxProxyTokenBodySchema
          }
        }
      },
      responses: {
        200: {
          description: 'sandbox-proxy token',
          content: {
            'application/json': {
              schema: SandboxProxyTokenResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/sandbox/internal/heartbeat': {
    post: {
      summary: '更新 sandbox 活跃时间',
      description: 'sandbox-proxy 内部接口，在 code-server websocket 存活时刷新 sandbox 活跃时间',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxHeartbeatBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '刷新结果',
          content: {
            'application/json': {
              schema: SandboxHeartbeatResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/sandbox/internal/proxyTarget': {
    post: {
      summary: '获取 sandbox-proxy 上游目标',
      description: 'sandbox-proxy 内部接口，根据 sandboxId 和服务名解析 provider 上游目标',
      tags: [TagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxProxyTargetBodySchema
          }
        }
      },
      responses: {
        200: {
          description: 'sandbox-proxy 上游目标',
          content: {
            'application/json': {
              schema: SandboxProxyTargetResponseSchema
            }
          }
        }
      }
    }
  }
};
