import z from 'zod';
import { SandboxUnavailableReasonEnum } from './constants';

export const SandboxUnavailableReasonSchema = z.enum(SandboxUnavailableReasonEnum);
export type SandboxUnavailableReason = z.infer<typeof SandboxUnavailableReasonSchema>;

export const SandboxImageConfigSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});
export type SandboxImageConfigType = z.infer<typeof SandboxImageConfigSchema>;

export const SandboxRuntimeStatusSchema = z.enum(['readyToInit', 'upgradeRequired', 'upgrading']);
export const SandboxRuntimeStatusResponseSchema = z.object({
  status: SandboxRuntimeStatusSchema.meta({
    example: 'upgradeRequired',
    description: 'Sandbox runtime image upgrade status'
  }),
  lastError: z.string().optional().meta({
    example: 'Failed to archive sandbox',
    description: 'Most recent runtime upgrade failure'
  })
});
export type SandboxRuntimeStatusResponse = z.infer<typeof SandboxRuntimeStatusResponseSchema>;

/**
 * Sandbox 生成文件的服务端持久化引用。
 *
 * url 只用于在历史读取时定位并替换旧签名链接；key 才是文件的稳定身份。
 * 该结构不会作为工具响应发送给模型或通过 SSE 暴露给前端。
 */
export const SandboxFileRefSchema = z.object({
  key: z.string(),
  filename: z.string(),
  url: z.string()
});
export type SandboxFileRef = z.infer<typeof SandboxFileRefSchema>;
