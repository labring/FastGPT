import { ChatIdSchema } from '../../../../core/chat/schema';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';
import {
  createOutLinkChatTargetInputSchema,
  createOutLinkChatTargetQuerySchema,
  transformChatAuthTargetInput
} from '../../chat/api';
import { SandboxUnavailableReasonSchema } from '../../../../core/ai/sandbox/type';
import { ChatSourceTypeEnum } from '../../../../core/chat/constants';
import { IntSchema } from '../../../../common/zod';

/* ============================================================================
 * 共享：agent-sandbox-proxy 内部反向调用鉴权请求头
 * ============================================================================ */

export const SandboxProxyHeaderSchema = z.object({
  'x-proxy-token': z.string().min(1).meta({
    example: 'configured-agent-sandbox-proxy-secret',
    description: 'agent-sandbox-proxy 与 FastGPT 主站之间的共享密钥'
  })
});

/* ============================================================================
 * API: 刷新沙盒会话活跃时间
 * Route: POST /api/core/ai/sandbox/keepalive
 * Method: POST
 * Description: 供 agent-sandbox-proxy 内部调用，刷新指定沙盒会话的活跃时间
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */

export const SandboxKeepaliveBodySchema = z.object({
  sourceType: z.enum(ChatSourceTypeEnum).meta({
    example: ChatSourceTypeEnum.app,
    description: '沙盒所属的对话来源类型'
  }),
  sourceId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '来源资源 ID，例如应用 ID 或技能 ID'
  }),
  userId: z.string().meta({
    example: '68ad85a7463006c963799a06',
    description: '沙盒所属用户 ID'
  }),
  chatId: ChatIdSchema.meta({
    example: 'bEdzC6PNupZrr1RoVutMF2DL',
    description: '沙盒会话 ID'
  }),
  teamId: z.string().optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '代理携带的团队 ID；当前仅用于调用上下文，不参与沙盒寻址'
  })
});
export type SandboxKeepaliveBody = z.infer<typeof SandboxKeepaliveBodySchema>;

/* ============================================================================
 * API: 校验沙盒 Ticket 或 Preview Session
 * Route: GET /api/core/ai/sandbox/verifyTicket
 * Method: GET
 * Description: 供 agent-sandbox-proxy 内部调用，解析沙盒地址、上游数据面鉴权头和 WebSocket 限制
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */

export const SandboxVerifyTicketQuerySchema = z.object({
  ticket: z.string().min(1).optional().meta({
    example: 'eyJhbGciOiJIUzI1NiJ9...',
    description: '沙盒 WebSocket 临时访问凭证；未传 Preview Session 请求头时必填'
  }),
  forceRefresh: z.enum(['true', 'false']).optional().meta({
    example: 'true',
    description: '是否强制刷新上游 IDE Agent 认证密钥缓存'
  })
});
export type SandboxVerifyTicketQuery = z.infer<typeof SandboxVerifyTicketQuerySchema>;

export const SandboxVerifyTicketHeaderSchema = SandboxProxyHeaderSchema.extend({
  'x-sandbox-preview-session': z.string().min(1).optional().meta({
    example: 'preview-session-id',
    description: '预览会话 ID；传入后无需 ticket 查询参数'
  })
});

export const SandboxVerifyTicketResponseSchema = z.object({
  sandbox_url: z.string().min(1).meta({
    example: 'http://sandbox-provider.internal:1318',
    description: 'IDE Agent 的代理连接地址'
  }),
  upstream_headers: z.record(z.string(), z.string()).optional().meta({
    description: '连接沙盒端点时需透传的上游数据面认证请求头'
  }),
  ws_limits: z.object({
    max_message_bytes: IntSchema.min(1).meta({
      example: 16777216,
      description: '单条 WebSocket 消息的最大字节数'
    }),
    max_frame_bytes: IntSchema.min(1).meta({
      example: 4194304,
      description: '单个 WebSocket frame 的最大字节数'
    })
  })
});
export type SandboxVerifyTicketResponse = z.infer<typeof SandboxVerifyTicketResponseSchema>;

const SandboxBaseShape = {
  chatId: ChatIdSchema.meta({
    example: 'bEdzC6PNupZrr1RoVutMF2DL',
    description: '对话 ID'
  }),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
};

const withSandboxTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOutLinkChatTargetInputSchema({
    ...SandboxBaseShape,
    ...shape
  }).transform(transformChatAuthTargetInput);

/**
 * 下载文件或目录 - 请求体（响应为文件流或 ZIP）
 */
export const SandboxDownloadBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  path: z.string().optional().default('.').describe('当前 Chat Session 下要下载的文件或目录路径')
});
export const SandboxDownloadBodySchema = withSandboxTarget({
  path: z.string().optional().default('.').describe('当前 Chat Session 下要下载的文件或目录路径')
});
export type SandboxDownloadBody = z.input<typeof SandboxDownloadBodySchema>;
export type SandboxDownloadRuntimeBody = z.output<typeof SandboxDownloadBodySchema>;

export const SandboxDownloadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件流或 ZIP 包' });

/* ============================================================================
 * API: 上传文件到沙盒工作区
 * Route: POST /api/core/ai/sandbox/upload
 * Method: POST
 * Description: 通过原始二进制请求流上传文件到当前 Chat Session
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */
export const SandboxUploadQueryRawSchema = createOutLinkChatTargetQuerySchema({
  ...SandboxBaseShape,
  path: z.string().meta({
    example: 'src/main.py',
    description: '目标文件路径，相对于当前 Chat Session 目录'
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
    description: '写入字节数'
  })
});
export type SandboxUploadQuery = z.input<typeof SandboxUploadQuerySchema>;
export type SandboxUploadRuntimeQuery = z.output<typeof SandboxUploadQuerySchema>;
export type SandboxUploadFile = z.infer<typeof SandboxUploadFileSchema>;
export type SandboxUploadResponse = z.infer<typeof SandboxUploadResponseSchema>;

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodyRawSchema = createOutLinkChatTargetInputSchema(SandboxBaseShape);
export const SandboxCheckExistBodySchema = withSandboxTarget({});
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在'),
  unavailableReason: SandboxUnavailableReasonSchema.optional().describe(
    '普通 App Chat 中沙盒不可用的产品态原因'
  )
});
export type SandboxCheckExistBody = z.input<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistRuntimeBody = z.output<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;

/* ============================================================================
 * API: 获取沙盒 WebSocket 临时访问凭证
 * Route: POST /api/core/ai/sandbox/getTicket
 * Method: POST
 * Description: 鉴权并返回包含短期 ticket 的 WebSocket 地址、文件大小限制和当前 Chat 会话工作目录
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */
export const SandboxChannelSchema = z.enum(['fs', 'terminal']).describe('沙盒 WebSocket 通道');
export const SandboxTicketPermissionSchema = z.enum(['read', 'write']).describe('沙盒 Ticket 权限');

export const SandboxGetTicketBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  channel: SandboxChannelSchema,
  permission: SandboxTicketPermissionSchema.optional()
    .default('read')
    .describe('fs 通道支持 read/write；terminal 通道固定需要 write')
});
export const SandboxGetTicketBodySchema = withSandboxTarget({
  channel: SandboxChannelSchema,
  permission: SandboxTicketPermissionSchema.optional()
    .default('read')
    .describe('fs 通道支持 read/write；terminal 通道固定需要 write')
});
export const SandboxGetTicketResponseSchema = z.object({
  wsUrl: z
    .string()
    .url()
    .regex(/^wss?:\/\//)
    .meta({
      example: 'wss://agent-proxy.example.com/fs?ticket=eyJhbGciOiJIUzI1NiJ9...',
      description: '包含短期凭证和对应通道的完整 WebSocket 地址；前端可直接连接'
    }),
  maxFileBytes: IntSchema.positive().meta({
    example: 379584512,
    description: '沙盒单文件大小限制（字节），与服务端及 IDE 使用同一配置来源'
  }),
  workspaceRoot: z.string().meta({
    example: '/home/sandbox/workspace',
    description: '用户级沙盒工作区根目录'
  }),
  sessionWorkDirectory: z.string().meta({
    example: '/home/sandbox/workspace/sessions/bEdzC6PNupZrr1RoVutMF2DL',
    description: '当前 Chat 默认工作目录'
  })
});
export type SandboxChannel = z.infer<typeof SandboxChannelSchema>;
export type SandboxTicketPermission = z.infer<typeof SandboxTicketPermissionSchema>;
export type SandboxGetTicketBody = z.input<typeof SandboxGetTicketBodySchema>;
export type SandboxGetTicketRuntimeBody = z.output<typeof SandboxGetTicketBodySchema>;
export type SandboxGetTicketResponse = z.infer<typeof SandboxGetTicketResponseSchema>;

/**
 * 获取 HTML 预览链接 - 请求/响应
 */
export const SandboxGetHtmlPreviewLinkBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  filePath: z.string().meta({
    example: 'dist/index.html',
    description: '当前 Chat Session 下的 HTML 文件路径'
  })
});
export const SandboxGetHtmlPreviewLinkBodySchema = withSandboxTarget({
  filePath: z.string().meta({
    example: 'dist/index.html',
    description: '当前 Chat Session 下的 HTML 文件路径'
  })
});
export const SandboxGetHtmlPreviewLinkResponseSchema = z.string().url().meta({
  example: 'https://agent-proxy.example.com/preview/a12345678901234567890123/dist/index.html',
  description: '由 agent-proxy 直接读取 sandbox workspace 的短期 HTML 预览链接'
});
export type SandboxGetHtmlPreviewLinkBody = z.input<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkRuntimeBody = z.output<
  typeof SandboxGetHtmlPreviewLinkBodySchema
>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;

/* ============================================================================
 * API: 解压沙盒工作区内的 .zip 文件
 * Route: POST /api/core/ai/sandbox/extractZip
 * Method: POST
 * Description: 通过 OpenSandbox execd 在当前 Chat 会话目录下将指定 .zip 文件解压到同名不冲突目录
 * Tags: ['Sandbox', 'Write']
 * ============================================================================ */
const validateRelativeZipPath = (value: string) => {
  if (!value || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    return false;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return false;
  }
  const fileName = segments[segments.length - 1];
  if (!fileName.toLowerCase().endsWith('.zip')) {
    return false;
  }
  const stem = fileName.slice(0, -4);
  return stem.length > 0 && stem !== '.' && stem !== '..';
};

export const SandboxExtractZipPathSchema = z
  .string()
  .refine(validateRelativeZipPath, {
    message: 'Path must be a valid relative .zip file path inside the current session directory'
  })
  .meta({
    example: 'uploads/demo.zip',
    description: '待解压的相对当前会话根目录的 .zip 文件路径'
  });

export const SandboxExtractZipBodyRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  path: SandboxExtractZipPathSchema
});
export const SandboxExtractZipBodySchema = withSandboxTarget({
  path: SandboxExtractZipPathSchema
});
export const SandboxExtractZipResponseSchema = z.object({
  targetDirPath: z.string().min(1).meta({
    example: 'uploads/demo',
    description: '实际解压生成的相对会话根目录的目录路径'
  })
});
export type SandboxExtractZipBody = z.input<typeof SandboxExtractZipBodySchema>;
export type SandboxExtractZipRuntimeBody = z.output<typeof SandboxExtractZipBodySchema>;
export type SandboxExtractZipResponse = z.infer<typeof SandboxExtractZipResponseSchema>;
