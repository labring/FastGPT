import { z } from 'zod';

export const OutLinkChatAuthSchema = z.union([
  z
    .object({
      shareId: z.string().optional(),
      outLinkUid: z.string().optional()
    })
    .meta({
      description: '分享链接鉴权',
      example: {
        shareId: '1234567890',
        outLinkUid: '1234567890'
      }
    }),
  z
    .object({
      teamId: z.string().optional(),
      teamToken: z.string().optional()
    })
    .meta({
      description: '团队鉴权',
      example: {
        teamId: '1234567890',
        teamToken: '1234567890'
      }
    })
]);
export type OutLinkChatAuthType = z.infer<typeof OutLinkChatAuthSchema>;
