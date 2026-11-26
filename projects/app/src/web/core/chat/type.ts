import type { z } from 'zod';
import type {
  createOutLinkChatTargetInputSchema,
  createOptionalOutLinkChatTargetInputSchema
} from '@fastgpt/global/openapi/core/chat/api';

/** Web UI 仅使用登录态或分享身份；按 union 分支去掉 API 身份，保留资源互斥关系。 */
type WebChatAuthTarget<T> = T extends unknown ? Omit<T, 'customUid' | 'authProxy'> : never;

/** 已确定的 Web 会话鉴权上下文，复用接口 union，不放宽资源或分享字段。 */
export type ResolvedChatAuthTargetInput = WebChatAuthTarget<
  z.infer<ReturnType<typeof createOutLinkChatTargetInputSchema<Record<never, never>>>>
>;

/** 允许缺省会话上下文，供按资源自身权限访问的客户端请求复用。 */
export type OptionalChatAuthTargetInput = WebChatAuthTarget<
  z.infer<ReturnType<typeof createOptionalOutLinkChatTargetInputSchema<Record<never, never>>>>
>;
