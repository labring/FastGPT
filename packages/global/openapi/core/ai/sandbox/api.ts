import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { z } from 'zod';

/**
 * 文件操作 - 统一请求体
 */
export const SandboxFileOperationBodySchema = z.union([
  z.object({
    action: z.literal('list'),
    appId: z.string(),
    chatId: z.string(),
    path: z.string().default('.').describe('目录路径'),
    outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
  }),
  z.object({
    action: z.literal('read'),
    appId: z.string(),
    chatId: z.string(),
    path: z.string().describe('文件路径'),
    outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
  }),
  z.object({
    action: z.literal('write'),
    appId: z.string(),
    chatId: z.string(),
    path: z.string().describe('文件路径'),
    content: z.string().describe('文件内容'),
    outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
  })
]);

export type SandboxFileOperationBody = z.infer<typeof SandboxFileOperationBodySchema>;

/**
 * 文件项
 */
export const SandboxFileItemSchema = z.object({
  name: z.string().describe('文件名'),
  path: z.string().describe('完整路径'),
  type: z.enum(['file', 'directory']).describe('文件类型'),
  size: z.number().optional().describe('文件大小(字节数)')
});

export type SandboxFileItem = z.infer<typeof SandboxFileItemSchema>;

/**
 * 文件操作 - 响应体
 */
export const SandboxFileOperationResponseSchema = z.union([
  z.object({
    action: z.literal('list'),
    files: z.array(SandboxFileItemSchema)
  }),
  z.object({
    action: z.literal('read'),
    content: z.string().describe('文件内容')
  }),
  z.object({
    action: z.literal('write'),
    success: z.boolean()
  })
]);

export type SandboxFileOperationResponse = z.infer<typeof SandboxFileOperationResponseSchema>;

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodySchema = z.object({
  appId: z.string(),
  chatId: z.string(),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});

export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在')
});

export type SandboxCheckExistBody = z.infer<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;
