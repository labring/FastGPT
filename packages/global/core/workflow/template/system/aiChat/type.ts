import z from 'zod';

export const AiChatQuoteRoleSchema = z.enum(['user', 'system']);
export type AiChatQuoteRoleType = z.infer<typeof AiChatQuoteRoleSchema>;
