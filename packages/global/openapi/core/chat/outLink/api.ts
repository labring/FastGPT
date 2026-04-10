import z from 'zod';

// ============= Init OutLink Chat =============
export const InitOutLinkChatQuerySchema = z.object({
  chatId: z.string().optional().describe('会话ID'),
  shareId: z.string().describe('分享链接ID'),
  outLinkUid: z.string().describe('外链用户ID')
});
export type InitOutLinkChatQueryType = z.infer<typeof InitOutLinkChatQuerySchema>;
