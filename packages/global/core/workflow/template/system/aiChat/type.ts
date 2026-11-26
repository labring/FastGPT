import z from 'zod';

export const AiChatQuoteRoleSchema = z.enum(['user', 'system']);
export type AiChatQuoteRoleType = z.infer<typeof AiChatQuoteRoleSchema>;

/** AI 对话知识库引用的默认角色：放进 user 消息以保持前缀缓存稳定。 */
export const DEFAULT_AI_CHAT_QUOTE_ROLE: AiChatQuoteRoleType = 'user';

/** 校验并返回合法的引用角色；非法或缺失值返回 undefined。 */
export const parseAiChatQuoteRole = (value: unknown): AiChatQuoteRoleType | undefined => {
  const parsed = AiChatQuoteRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** 归一化引用角色：合法值原样保留，缺失或非法值统一回退默认 user。 */
export const resolveAiChatQuoteRole = (value: unknown): AiChatQuoteRoleType =>
  parseAiChatQuoteRole(value) ?? DEFAULT_AI_CHAT_QUOTE_ROLE;
