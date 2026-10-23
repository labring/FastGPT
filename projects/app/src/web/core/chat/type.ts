import type { z } from 'zod';
import type {
  createOutLinkChatTargetInputSchema,
  createOptionalOutLinkChatTargetInputSchema
} from '@fastgpt/global/openapi/core/chat/api';

/** 已确定的会话鉴权上下文，复用接口 union 类型，避免客户端重新放宽为全可选字段。 */
export type ResolvedChatAuthTargetInput = z.infer<
  ReturnType<typeof createOutLinkChatTargetInputSchema<Record<never, never>>>
>;

/** 允许缺省会话上下文，供按资源自身权限访问的客户端请求复用。 */
export type OptionalChatAuthTargetInput = z.infer<
  ReturnType<typeof createOptionalOutLinkChatTargetInputSchema<Record<never, never>>>
>;
