import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';

const SandboxBaseSchema = z.object({
  appId: z.string(),
  chatId: z.string(),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});

/**
 * 列出目录 - 请求/响应
 */
export const SandboxListBodySchema = SandboxBaseSchema.extend({
  path: z.string().default('.').describe('目录路径')
});
export type SandboxListBody = z.infer<typeof SandboxListBodySchema>;

export const SandboxFileItemSchema = z.object({
  name: z.string().describe('文件名'),
  path: z.string().describe('完整路径'),
  type: z.enum(['file', 'directory']).describe('文件类型'),
  size: z.number().optional().describe('文件大小(字节数)')
});
export type SandboxFileItem = z.infer<typeof SandboxFileItemSchema>;

export const SandboxListResponseSchema = z.object({
  files: z.array(SandboxFileItemSchema)
});
export type SandboxListResponse = z.infer<typeof SandboxListResponseSchema>;

/**
 * 写入文件 - 请求/响应
 */
export const SandboxWriteBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径'),
  content: z.string().describe('文件内容')
});
export type SandboxWriteBody = z.infer<typeof SandboxWriteBodySchema>;

export const SandboxWriteResponseSchema = z.object({
  success: z.boolean()
});
export type SandboxWriteResponse = z.infer<typeof SandboxWriteResponseSchema>;

/**
 * 读取文件内容 - 请求体（响应为原始文件流）
 */
export const SandboxReadBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径')
});
export type SandboxReadBody = z.infer<typeof SandboxReadBodySchema>;

export const SandboxReadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件内容流' });

/**
 * 下载文件或目录 - 请求体（响应为文件流或 ZIP）
 */
export const SandboxDownloadBodySchema = SandboxBaseSchema.extend({
  path: z.string().optional().default('.').describe('要下载的路径(文件或目录)')
});
export type SandboxDownloadBody = z.input<typeof SandboxDownloadBodySchema>;

export const SandboxDownloadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件流或 ZIP 包' });

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodySchema = SandboxBaseSchema;
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在')
});
export type SandboxCheckExistBody = z.infer<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;

/**
 * 获取 HTML 预览链接 - 请求/响应
 */
export const SandboxGetHtmlPreviewLinkBodySchema = SandboxBaseSchema.extend({
  filePath: z.string().describe('文件路径')
});
export const SandboxGetHtmlPreviewLinkResponseSchema = z.string().describe('HTML 预览链接');
export type SandboxGetHtmlPreviewLinkBody = z.infer<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;
