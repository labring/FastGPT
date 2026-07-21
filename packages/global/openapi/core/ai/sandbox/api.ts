import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';
import { createOutLinkChatTargetInputSchema, transformChatAuthTargetInput } from '../../chat/api';

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

/**
 * 上传文件到沙盒工作区 - multipart/form-data 文档结构。
 */
export const SandboxUploadMultipartSchema = z.object({
  file: z.any().meta({
    format: 'binary',
    description: '上传文件，multipart/form-data 的 file 字段'
  }),
  data: createOutLinkChatTargetInputSchema({
    ...SandboxBaseShape,
    path: z.string().meta({
      example: 'src/main.py',
      description: '目标文件路径，相对于当前 Chat Session 目录'
    })
  }).meta({
    description: '上传参数，JSON 序列化后传入 multipart/form-data 的 data 字段'
  })
});
export const SandboxUploadBodySchema = withSandboxTarget({
  path: z.string().meta({
    example: 'src/main.py',
    description: '目标文件路径，相对于当前 Chat Session 目录'
  })
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
export type SandboxUploadBody = z.input<typeof SandboxUploadBodySchema>;
export type SandboxUploadRuntimeBody = z.output<typeof SandboxUploadBodySchema>;
export type SandboxUploadResponse = z.infer<typeof SandboxUploadResponseSchema>;

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodyRawSchema = createOutLinkChatTargetInputSchema(SandboxBaseShape);
export const SandboxCheckExistBodySchema = withSandboxTarget({});
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在')
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
  filePath: z.string().describe('当前 Chat Session 下的 HTML 文件路径')
});
export const SandboxGetHtmlPreviewLinkBodySchema = withSandboxTarget({
  filePath: z.string().describe('当前 Chat Session 下的 HTML 文件路径')
});
export const SandboxGetHtmlPreviewLinkResponseSchema = z.string().describe('HTML 预览链接');
export type SandboxGetHtmlPreviewLinkBody = z.input<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkRuntimeBody = z.output<
  typeof SandboxGetHtmlPreviewLinkBodySchema
>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;
