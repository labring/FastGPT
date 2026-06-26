import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';
import { createChatTargetInputSchema, transformChatTargetInput } from '../../chat/api';

const SandboxBaseShape = {
  chatId: z.string().meta({
    example: 'bEdzC6PNupZrr1RoVutMF2DL',
    description: '对话 ID'
  }),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
};

const withSandboxTarget = <T extends z.ZodRawShape>(shape: T) =>
  createChatTargetInputSchema({
    ...SandboxBaseShape,
    ...shape
  }).transform(transformChatTargetInput);

/**
 * 下载文件或目录 - 请求体（响应为文件流或 ZIP）
 */
export const SandboxDownloadBodyRawSchema = createChatTargetInputSchema({
  ...SandboxBaseShape,
  path: z.string().optional().default('.').describe('要下载的路径(文件或目录)')
});
export const SandboxDownloadBodySchema = withSandboxTarget({
  path: z.string().optional().default('.').describe('要下载的路径(文件或目录)')
});
export type SandboxDownloadBody = z.input<typeof SandboxDownloadBodySchema>;
export type SandboxDownloadRuntimeBody = z.output<typeof SandboxDownloadBodySchema>;

export const SandboxDownloadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件流或 ZIP 包' });

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodyRawSchema = createChatTargetInputSchema(SandboxBaseShape);
export const SandboxCheckExistBodySchema = withSandboxTarget({});
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在')
});
export type SandboxCheckExistBody = z.input<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistRuntimeBody = z.output<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;

/**
 * 获取沙盒 WebSocket 临时访问凭证。
 */
export const SandboxChannelSchema = z.enum(['fs', 'terminal']).describe('沙盒 WebSocket 通道');
export const SandboxTicketPermissionSchema = z.enum(['read', 'write']).describe('沙盒 Ticket 权限');

export const SandboxGetTicketBodyRawSchema = createChatTargetInputSchema({
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
  ticket: z.string().describe('沙盒 WebSocket 临时访问凭证')
});
export type SandboxChannel = z.infer<typeof SandboxChannelSchema>;
export type SandboxTicketPermission = z.infer<typeof SandboxTicketPermissionSchema>;
export type SandboxGetTicketBody = z.input<typeof SandboxGetTicketBodySchema>;
export type SandboxGetTicketRuntimeBody = z.output<typeof SandboxGetTicketBodySchema>;
export type SandboxGetTicketResponse = z.infer<typeof SandboxGetTicketResponseSchema>;

/**
 * 获取 HTML 预览链接 - 请求/响应
 */
export const SandboxGetHtmlPreviewLinkBodyRawSchema = createChatTargetInputSchema({
  ...SandboxBaseShape,
  filePath: z.string().describe('文件路径')
});
export const SandboxGetHtmlPreviewLinkBodySchema = withSandboxTarget({
  filePath: z.string().describe('文件路径')
});
export const SandboxGetHtmlPreviewLinkResponseSchema = z.string().describe('HTML 预览链接');
export type SandboxGetHtmlPreviewLinkBody = z.input<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkRuntimeBody = z.output<
  typeof SandboxGetHtmlPreviewLinkBodySchema
>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;
