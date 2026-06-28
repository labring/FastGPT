import z from 'zod';
import { InitChatResponseSchema } from '../controler/api';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';

// ============= Init OutLink Chat =============
export const InitOutLinkChatQuerySchema = z.object({
  chatId: z.string().optional().describe('会话ID'),
  outLinkAuthData: OutLinkChatAuthSchema.describe('外链鉴权数据。GET query 中需 JSON 序列化。')
});
export type InitOutLinkChatQueryType = z.infer<typeof InitOutLinkChatQuerySchema>;
export const InitOutLinkChatResponseSchema = InitChatResponseSchema;
export type InitOutLinkChatResponseType = z.infer<typeof InitOutLinkChatResponseSchema>;
