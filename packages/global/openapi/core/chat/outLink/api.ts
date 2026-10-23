import z from 'zod';
import { InitChatResponseSchema } from '../controler/api';
import { OutLinkChatAuthQuerySchema } from '../../../../support/permission/chat';

/* ============================================================================
 * API: 初始化外链会话
 * Route: GET /api/core/chat/outLink/init
 * Description: 通过分享身份初始化外链会话；应用或 Skill 调试会话使用 /core/chat/init。
 * ============================================================================ */
export const InitOutLinkChatQuerySchema = z.object({
  chatId: z.string().optional().describe('已有会话 ID，可省略'),
  outLinkAuthData: OutLinkChatAuthQuerySchema.meta({
    example: JSON.stringify({ shareId: 'share-id', outLinkUid: 'outlink-user-id' }),
    description: '外链鉴权数据，包含 shareId 与 outLinkUid。GET query 中需 JSON 序列化。'
  })
});
export type InitOutLinkChatQueryType = z.infer<typeof InitOutLinkChatQuerySchema>;
export const InitOutLinkChatResponseSchema = InitChatResponseSchema;
export type InitOutLinkChatResponseType = z.infer<typeof InitOutLinkChatResponseSchema>;
