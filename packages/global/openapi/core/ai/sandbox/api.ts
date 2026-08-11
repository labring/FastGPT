import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';
import { createOutLinkChatTargetInputSchema, transformChatAuthTargetInput } from '../../chat/api';
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
  chatId: z.string().meta({
    example: 'bEdzC6PNupZrr1RoVutMF2DL',
    description: '沙盒会话 ID'
  }),
  teamId: z.string().optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '代理携带的团队 ID；当前仅用于调用上下文，不参与沙盒寻址'
  })
});
export type SandboxKeepaliveBody = z.infer<typeof SandboxKeepaliveBodySchema>;

export const SandboxKeepaliveResponseSchema = z.undefined().meta({
  description: '保活成功'
});
export type SandboxKeepaliveResponse = z.infer<typeof SandboxKeepaliveResponseSchema>;

/* ============================================================================
 * API: 校验沙盒 Ticket 或 Preview Session
 * Route: GET /api/core/ai/sandbox/verifyTicket
 * Method: GET
 * Description: 供 agent-sandbox-proxy 内部调用，解析沙盒地址、Agent 口令和 WebSocket 限制
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */

export const SandboxVerifyTicketQuerySchema = z.object({
  ticket: z.string().meta({
    example: 'eyJhbGciOiJIUzI1NiJ9...',
    description: '沙盒 WebSocket 临时访问凭证'
  })
});
export type SandboxVerifyTicketQuery = z.infer<typeof SandboxVerifyTicketQuerySchema>;

export const SandboxVerifyTicketDocumentQuerySchema = z.object({
  ticket: SandboxVerifyTicketQuerySchema.shape.ticket.optional().meta({
    description: '沙盒 WebSocket 临时访问凭证；未传 Preview Session 请求头时必填'
  })
});

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
  agent_token: z.string().meta({
    example: 'temporary-agent-password',
    description: '连接 IDE Agent 使用的临时口令'
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
  chatId: z.string().meta({
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
export const SandboxUploadQueryRawSchema = createOutLinkChatTargetInputSchema({
  ...SandboxBaseShape,
  path: z.string().meta({
    example: 'src/main.py',
    description: '目标文件路径，相对于当前 Chat Session 目录'
  })
});
export const SandboxUploadQuerySchema = withSandboxTarget({
  path: z.string().meta({
    example: 'src/main.py',
    description: '目标文件路径，相对于当前 Chat Session 目录'
  })
});
export const SandboxUploadFileSchema = z.string().meta({
  format: 'binary',
  description: '文件原始二进制内容'
});
export const SandboxUploadResponseSchema = z.object({
  path: z.string().meta({
    example: 'src/main.py',
    description: '上传成功后的目标文件路径'
  }),
  bytesWritten: z.number().int().nonnegative().meta({
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
 * Description: 鉴权并返回 proxy ticket，以及当前 Chat 的会话工作目录
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
  ticket: z.string().meta({
    example: 'eyJhbGciOiJIUzI1NiJ9...',
    description: '沙盒 WebSocket 临时访问凭证'
  }),
  workspaceRoot: z.string().meta({
    example: '/workspace',
    description: '用户级沙盒工作区根目录'
  }),
  sessionWorkDirectory: z.string().meta({
    example: '/workspace/sessions/bEdzC6PNupZrr1RoVutMF2DL',
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
  example:
    'https://agent-proxy.example.com/preview/app-0123456789abcdef/a12345678901234567890123/dist/index.html',
  description: '由 agent-proxy 直接读取 sandbox workspace 的短期 HTML 预览链接'
});
export type SandboxGetHtmlPreviewLinkBody = z.input<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkRuntimeBody = z.output<
  typeof SandboxGetHtmlPreviewLinkBodySchema
>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;
