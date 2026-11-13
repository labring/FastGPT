import { ChatIdSchema } from '../../../../core/chat/schema';
import { ChatSourceTypeEnum } from '../../../../core/chat/constants';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';
import {
  createOutLinkChatTargetInputSchema,
  createOutLinkChatTargetQuerySchema,
  transformChatAuthTargetInput
} from '../../chat/api';
import {
  SandboxSessionDirEntrySchema,
  SandboxUnavailableReasonSchema
} from '../../../../core/ai/sandbox/type';
import {
  SANDBOX_FS_EXEC_DEFAULT_TIMEOUT_MS,
  SANDBOX_FS_EXEC_MAX_TIMEOUT_MS,
  SANDBOX_KEEPALIVE_MAX_BATCH_SIZE
} from '../../../../core/ai/sandbox/constants';
import { IntSchema } from '../../../../common/zod';

const SandboxBaseShape = {
  chatId: ChatIdSchema.meta({
    example: 'bEdzC6PNupZrr1RoVutMF2DL',
    description: '对话 ID'
  }),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
};

/* ============================================================================
 * API: 下载沙盒文件或目录
 * Route: POST /api/core/ai/sandbox/download
 * Method: POST
 * Description: 下载当前 Chat Session 下的单个原始文件流或将目录递归打包为 ZIP 下载
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */
export const SandboxDownloadBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  path: z.string().optional().default('.').meta({
    example: 'src/main.py',
    description: '当前 Chat Session 下要下载的文件或目录路径'
  })
});
export const SandboxDownloadBodySchema = SandboxDownloadBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type SandboxDownloadBody = z.input<typeof SandboxDownloadBodySchema>;

export const SandboxDownloadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件流或 ZIP 包' });

/* ============================================================================
 * API: 上传文件到沙盒工作区
 * Route: POST /api/core/ai/sandbox/upload
 * Method: POST
 * Description: 流式上传或保存沙盒会话文件，支持 oldEtag 乐观并发校验
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */
export const SandboxUploadQueryRawSchema = createOutLinkChatTargetQuerySchema({
  ...SandboxBaseShape,
  path: z.string().min(1).meta({
    example: 'src/main.py',
    description: '目标文件路径，相对于当前 Chat Session 目录'
  }),
  oldEtag: z.string().optional().meta({
    example: 'W/"12-1735689600000"',
    description: '读取或上次保存返回的版本；提交前不匹配或文件已删除时拒绝覆盖'
  })
});
export const SandboxUploadQuerySchema = SandboxUploadQueryRawSchema.transform(
  transformChatAuthTargetInput
);
export const SandboxUploadFileSchema = z.string().meta({
  format: 'binary',
  description: '文件原始二进制内容'
});
export const SandboxUploadResponseSchema = z.object({
  path: z.string().meta({
    example: 'src/main.py',
    description: '上传成功后的目标文件路径'
  }),
  bytesWritten: IntSchema.nonnegative().meta({
    example: 1024,
    description: '实际接收并写入的字节数'
  }),
  etag: z.string().optional().meta({
    example: 'W/"12-1735689600000"',
    description: '本次成功保存的文件版本，用于下一次 oldEtag 校验'
  })
});
export type SandboxUploadQuery = z.input<typeof SandboxUploadQuerySchema>;
export type SandboxUploadResponse = z.infer<typeof SandboxUploadResponseSchema>;

/* ============================================================================
 * API: 检查沙盒是否存在
 * Route: POST /api/core/ai/sandbox/checkExist
 * Method: POST
 * Description: 检查当前会话对应的沙盒持久化实例是否已存在及可用性状态
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */
export const SandboxCheckExistBodyRawSchema = createOutLinkChatTargetInputSchema(SandboxBaseShape);
export const SandboxCheckExistBodySchema = SandboxCheckExistBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().meta({ example: true, description: '沙盒是否存在' }),
  unavailableReason: SandboxUnavailableReasonSchema.optional().meta({
    example: 'appDisabled',
    description: '普通 App Chat 中沙盒不可用的产品态原因'
  })
});
export type SandboxCheckExistBody = z.input<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;

/* ============================================================================
 * API: 获取沙盒文件预览链接
 * Route: POST /api/core/ai/sandbox/getFilePreviewLink
 * Method: POST
 * Description: 校验文件落在工作区内且非目录后签发短期只读链接，支持媒体 Range 加载
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */
export const SandboxGetFilePreviewLinkBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  filePath: z.string().meta({
    example: 'dist/index.html',
    description: '当前 Chat Session 下的文件路径'
  })
});
export const SandboxGetFilePreviewLinkBodySchema = SandboxGetFilePreviewLinkBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export const SandboxGetFilePreviewLinkResponseSchema = z.object({
  url: z.string().url().meta({
    example: 'https://sandbox-proxy.example.com/preview/a12345678901234567890123/dist/index.html',
    description: '由 opensandbox-proxy 流式代理 execd /files/download 的短期只读预览链接'
  }),
  expiresAt: IntSchema.positive().meta({
    example: 1735696800000,
    description: '链接过期时间，毫秒时间戳；客户端可在有效期内复用，避免重复签发'
  })
});
export type SandboxGetFilePreviewLinkBody = z.input<typeof SandboxGetFilePreviewLinkBodySchema>;
export type SandboxGetFilePreviewLinkResponse = z.infer<
  typeof SandboxGetFilePreviewLinkResponseSchema
>;

/* ============================================================================
 * API: 单层列出沙盒目录
 * Route: POST /api/core/ai/sandbox/fs/list
 * Method: POST
 * Description: 按 depth=1 懒加载列出当前会话工作目录下的子目录与文件及运行配额信息
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */

export const SandboxFsListBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  path: z.string().optional().default('.').meta({
    description: '相对于当前会话工作目录的目录路径',
    example: '.'
  })
});
export const SandboxFsListBodySchema = SandboxFsListBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export const SandboxFsListResponseSchema = z.object({
  entries: z.array(SandboxSessionDirEntrySchema).meta({
    description: '当前目录下的单层文件与子目录列表'
  }),
  maxFileBytes: IntSchema.positive().meta({
    description: '允许上传或编辑的单文件最大字节数',
    example: 917504000
  }),
  sessionWorkDirectory: z.string().meta({
    description: '当前会话在沙盒内的工作目录',
    example: '/workspace/sessions/bEdzC6PNupZrr1RoVutMF2DL'
  })
});
export type SandboxFsListBody = z.input<typeof SandboxFsListBodySchema>;
export type SandboxFsListResponse = z.infer<typeof SandboxFsListResponseSchema>;

/* ============================================================================
 * API: 新建沙盒目录
 * Route: POST /api/core/ai/sandbox/fs/mkdir
 * Method: POST
 * Description: 在当前会话沙盒工作目录下递归创建目录
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */
export const SandboxFsMkdirBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  path: z.string().min(1).meta({
    description: '相对于当前会话工作目录的新目录路径',
    example: 'src/components'
  })
});
export const SandboxFsMkdirBodySchema = SandboxFsMkdirBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type SandboxFsMkdirBody = z.input<typeof SandboxFsMkdirBodySchema>;

/* ============================================================================
 * API: 移动或重命名沙盒文件/目录
 * Route: POST /api/core/ai/sandbox/fs/move
 * Method: POST
 * Description: 在当前会话沙盒工作目录内移动或重命名文件/目录
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */
export const SandboxFsMoveBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  from: z.string().min(1).meta({
    description: '源相对路径',
    example: 'src/old.ts'
  }),
  to: z.string().min(1).meta({
    description: '目标相对路径',
    example: 'src/new.ts'
  })
});
export const SandboxFsMoveBodySchema = SandboxFsMoveBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type SandboxFsMoveBody = z.input<typeof SandboxFsMoveBodySchema>;

/* ============================================================================
 * API: 删除沙盒文件或目录
 * Route: POST /api/core/ai/sandbox/fs/delete
 * Method: POST
 * Description: 删除当前会话沙盒工作目录下的指定文件或目录
 * Tags: ['Sandbox', 'Delete']
 * ============================================================================ */
export const SandboxFsDeleteBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  path: z.string().min(1).meta({
    description: '要删除的文件或目录相对路径',
    example: 'src/old.ts'
  })
});
export const SandboxFsDeleteBodySchema = SandboxFsDeleteBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type SandboxFsDeleteBody = z.input<typeof SandboxFsDeleteBodySchema>;

/* ============================================================================
 * API: 在沙盒工作目录内执行命令
 * Route: POST /api/core/ai/sandbox/fs/exec
 * Method: POST
 * Description: 在当前会话沙盒工作目录下执行单条非交互式命令并返回输出
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */
export const SandboxFsExecBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  command: z.string().min(1).meta({
    description: '要在当前会话工作目录下执行的命令',
    example: 'unzip -o archive.zip -d ./out'
  }),
  timeoutMs: IntSchema.positive()
    .max(SANDBOX_FS_EXEC_MAX_TIMEOUT_MS)
    .default(SANDBOX_FS_EXEC_DEFAULT_TIMEOUT_MS)
    .meta({
      description: `命令超时毫秒数（默认 ${SANDBOX_FS_EXEC_DEFAULT_TIMEOUT_MS}，上限 ${SANDBOX_FS_EXEC_MAX_TIMEOUT_MS}）`,
      example: SANDBOX_FS_EXEC_DEFAULT_TIMEOUT_MS
    })
});
export const SandboxFsExecBodySchema = SandboxFsExecBodyRawSchema.transform(
  transformChatAuthTargetInput
);
export type SandboxFsExecBody = z.input<typeof SandboxFsExecBodySchema>;

/* ============================================================================
 * API: 签发沙盒交互式终端连接票据
 * Route: POST /api/core/ai/sandbox/getTicket
 * Method: POST
 * Description: 仅限技能编辑调试会话，确保容器内 PTY 会话就绪并签发连接 opensandbox-proxy 的短期 HS256 Ticket
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */
export const SandboxGetTicketBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  cols: IntSchema.min(1).max(1000).optional().meta({
    description: '终端初始列数',
    example: 80
  }),
  rows: IntSchema.min(1).max(1000).optional().meta({
    description: '终端初始行数',
    example: 24
  })
});
export const SandboxGetTicketBodySchema = SandboxGetTicketBodyRawSchema.transform(
  transformChatAuthTargetInput
).superRefine((data, ctx) => {
  if (data.sourceType !== ChatSourceTypeEnum.skillEdit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['skillId'],
      message: 'Sandbox terminal is only available in edit debug sessions'
    });
  }
});
export const SandboxGetTicketResponseSchema = z.object({
  ticket: z.string().min(1).meta({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: '有效期 60 秒的终端连接 HS256 JWT 票据'
  }),
  url: z.string().meta({
    example: 'wss://sandbox-proxy.example.com/terminal',
    description: '由 AGENT_SANDBOX_PROXY_URL 归一化派生的终端 WebSocket 地址'
  }),
  ptySessionId: z.string().min(1).meta({
    example: 'pty-session-123',
    description: '当前沙盒绑定的 execd PTY 会话 ID'
  }),
  reused: z.boolean().meta({
    example: true,
    description: '是否复用了容器内已有的活跃 PTY 会话'
  })
});
export type SandboxGetTicketBody = z.input<typeof SandboxGetTicketBodySchema>;
export type SandboxGetTicketResponse = z.infer<typeof SandboxGetTicketResponseSchema>;

/* ============================================================================
 * API: 校验沙盒代理内部票据或预览会话
 * Route: GET /api/core/ai/sandbox/verifyTicket
 * Method: GET
 * Description: 仅供 opensandbox-proxy 内部回调，核验终端 Ticket 或预览 sessionId 并返回 execd 连接信息
 * Tags: ['Sandbox', 'Internal']
 * ============================================================================ */
export const SandboxVerifyTicketQueryRawSchema = z.object({
  ticket: z.string().min(1).optional().meta({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: '终端模式传入的短期 HS256 JWT 票据（与 previewSessionId 二选一）'
  }),
  previewSessionId: z.string().min(1).optional().meta({
    example: 'a12345678901234567890123',
    description: '预览模式传入的 24 位预览会话 ID（与 ticket 二选一）'
  })
});
export const SandboxVerifyTicketQuerySchema = SandboxVerifyTicketQueryRawSchema.superRefine(
  (data, ctx) => {
    const hasTicket = Boolean(data.ticket);
    const hasPreview = Boolean(data.previewSessionId);
    if (hasTicket === hasPreview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ticket'],
        message: 'Exactly one of ticket or previewSessionId must be provided'
      });
    }
  }
);
export const SandboxVerifyTicketResponseSchema = z.object({
  sandboxId: z.string().min(1).meta({
    example: 'skilledit-0123456789abcdef',
    description: '沙盒持久化逻辑 ID'
  }),
  execdBaseUrl: z.string().url().meta({
    example: 'http://opensandbox:8090/sandboxes/sbx-123/proxy/44772',
    description: 'OpenSandbox Server Proxy 下的 execd 基地址'
  }),
  execdHeaders: z.record(z.string(), z.string()).meta({
    example: { 'OPEN-SANDBOX-API-KEY': 'token' },
    description: '访问 execd 所需的上游鉴权请求头'
  }),
  ptySessionId: z.string().min(1).optional().meta({
    example: 'pty-session-123',
    description: '终端模式下返回的活跃 PTY 会话 ID'
  }),
  reused: z.boolean().optional().meta({
    example: true,
    description: '终端模式下是否复用了已有 PTY 会话'
  }),
  rootDirectory: z.string().min(1).optional().meta({
    example: '/workspace',
    description: '预览模式下允许读取的工作区根路径'
  })
});
export type SandboxVerifyTicketQuery = z.infer<typeof SandboxVerifyTicketQuerySchema>;
export type SandboxVerifyTicketResponse = z.infer<typeof SandboxVerifyTicketResponseSchema>;

/* ============================================================================
 * API: 批量续期活跃沙盒实例
 * Route: POST /api/core/ai/sandbox/keepalive
 * Method: POST
 * Description: 仅供 opensandbox-proxy 内部回调，批量刷新存在活跃终端或预览流量的沙盒 lastActiveAt
 * Tags: ['Sandbox', 'Internal']
 * ============================================================================ */
export const SandboxKeepaliveBodyRawSchema = z.object({
  sandboxIds: z
    .array(z.string().min(1))
    .min(1)
    .max(SANDBOX_KEEPALIVE_MAX_BATCH_SIZE)
    .meta({
      example: ['skilledit-0123456789abcdef'],
      description: `单次批量续期的沙盒 ID 列表（最多 ${SANDBOX_KEEPALIVE_MAX_BATCH_SIZE} 个）`
    })
});
export const SandboxKeepaliveBodySchema = SandboxKeepaliveBodyRawSchema.transform((data) => ({
  sandboxIds: Array.from(new Set(data.sandboxIds))
}));
export type SandboxKeepaliveBody = z.input<typeof SandboxKeepaliveBodySchema>;
