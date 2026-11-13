import { createChatTargetQueryParameters } from '../../chat/api';
import z from 'zod';
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
  SandboxGetFilePreviewLinkBodyRawSchema,
  SandboxGetFilePreviewLinkResponseSchema,
  SandboxFsListBodyRawSchema,
  SandboxFsListResponseSchema,
  SandboxFsMkdirBodyRawSchema,
  SandboxFsMoveBodyRawSchema,
  SandboxFsDeleteBodyRawSchema,
  SandboxFsExecBodyRawSchema,
  SandboxGetTicketBodyRawSchema,
  SandboxGetTicketResponseSchema,
  SandboxVerifyTicketQueryRawSchema,
  SandboxVerifyTicketResponseSchema,
  SandboxKeepaliveBodyRawSchema
} from './api';
import { ExecuteResultSchema } from '../../../../core/ai/sandbox/type';

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
          description: '单文件返回原始字节与 ETag 版本头；目录返回 ZIP',
          headers: {
            ETag: { description: '单文件版本，保存时作为 oldEtag 传回', schema: z.string() },
            'Content-Length': { description: '单文件字节数', schema: z.string() }
          },
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
        '校验单文件大小上限与 oldEtag 并发版本后，将原始字节流直接流式上传至沙盒并由 execd 原子替换目标文件；超限中断时保留原文件',
      tags: [DevApiTagsMap.sandbox],
      parameters: createChatTargetQueryParameters(SandboxUploadQueryRawSchema),
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

  '/core/ai/sandbox/getFilePreviewLink': {
    post: {
      summary: '获取文件预览链接',
      description: '校验文件后签发短期只读链接，由 opensandbox-proxy 流式代理沙盒工作区文件',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxGetFilePreviewLinkBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '文件预览链接',
          content: {
            'application/json': {
              schema: SandboxGetFilePreviewLinkResponseSchema
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

  '/core/ai/sandbox/fs/list': {
    post: {
      summary: '单层列出沙盒目录',
      description:
        '按 depth=1 懒加载列出当前会话工作目录下的指定子目录，并返回运行态配额与路径信息',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxFsListBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '目录项列表',
          content: {
            'application/json': {
              schema: SandboxFsListResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/fs/mkdir': {
    post: {
      summary: '创建沙盒目录',
      description: '在当前会话工作目录内递归创建子目录',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxFsMkdirBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '创建成功'
        }
      }
    }
  },

  '/core/ai/sandbox/fs/move': {
    post: {
      summary: '移动或重命名沙盒文件/目录',
      description: '在当前会话工作目录内移动或重命名文件或目录',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxFsMoveBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '移动成功'
        }
      }
    }
  },

  '/core/ai/sandbox/fs/delete': {
    post: {
      summary: '删除沙盒文件或目录',
      description: '删除当前会话工作目录内的指定文件或目录',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxFsDeleteBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '删除成功'
        }
      }
    }
  },

  '/core/ai/sandbox/fs/exec': {
    post: {
      summary: '在沙盒会话目录执行命令',
      description: '在当前会话工作目录下执行一次性命令并返回 stdout/stderr/exitCode',
      tags: [DevApiTagsMap.sandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxFsExecBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '命令执行结果',
          content: {
            'application/json': {
              schema: ExecuteResultSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/getTicket': {
    post: {
      summary: '签发沙盒交互式终端连接票据',
      description:
        '仅限技能编辑调试会话，确保容器内 PTY 会话就绪并返回 opensandbox-proxy WebSocket 地址与短期票据',
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
          description: '终端连接票据与 WebSocket 地址',
          content: {
            'application/json': {
              schema: SandboxGetTicketResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/verifyTicket': {
    get: {
      summary: '校验沙盒代理内部票据或预览会话',
      description:
        '仅供 opensandbox-proxy 内部回调，核验终端 Ticket 或预览 sessionId 并返回 execd 连接信息',
      tags: [DevApiTagsMap.reverseInvokeSandbox],
      requestParams: {
        query: SandboxVerifyTicketQueryRawSchema
      },
      responses: {
        200: {
          description: 'execd 连接信息',
          content: {
            'application/json': {
              schema: SandboxVerifyTicketResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/sandbox/keepalive': {
    post: {
      summary: '批量续期活跃沙盒实例',
      description: '仅供 opensandbox-proxy 内部回调，批量刷新运行态沙盒实例的 lastActiveAt',
      tags: [DevApiTagsMap.reverseInvokeSandbox],
      requestBody: {
        content: {
          'application/json': {
            schema: SandboxKeepaliveBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '续期成功'
        }
      }
    }
  }
};
