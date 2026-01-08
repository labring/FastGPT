import z from 'zod';

export const ShareChatAuthSchema = z.object({
  shareId: z.string().optional().describe('分享链接ID'),
  outLinkUid: z.string().optional().describe('外链用户ID')
});
export type ShareChatAuthProps = z.infer<typeof ShareChatAuthSchema>;

export const TeamChatAuthSchema = z.object({
  teamId: z.string().optional().describe('团队ID'),
  teamToken: z.string().optional().describe('团队Token')
});
export type TeamChatAuthProps = z.infer<typeof TeamChatAuthSchema>;

export const OutLinkChatAuthSchema = ShareChatAuthSchema.extend(TeamChatAuthSchema.shape);
export type OutLinkChatAuthProps = z.infer<typeof OutLinkChatAuthSchema>;
