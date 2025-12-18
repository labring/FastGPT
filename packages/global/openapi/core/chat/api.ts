import type { OutLinkChatAuthType } from '../../../support/permission/chat/type';
import { OutLinkChatAuthSchema } from '../../../support/permission/chat/type';
import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';

export const PresignChatFileGetUrlSchema = z
  .object({
    key: z.string().min(1).describe('文件key'),
    appId: ObjectIdSchema.describe('应用ID'),
    outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
  })
  .meta({
    example: {
      key: '1234567890',
      appId: '1234567890',
      outLinkAuthData: {
        shareId: '1234567890',
        outLinkUid: '1234567890'
      }
    }
  });
export type PresignChatFileGetUrlParams = z.infer<typeof PresignChatFileGetUrlSchema>;

export const PresignChatFilePostUrlSchema = z
  .object({
    filename: z.string().min(1).describe('文件名'),
    appId: ObjectIdSchema.describe('应用ID'),
    chatId: z.string().min(1).describe('对话ID'),
    outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
  })
  .meta({
    example: {
      filename: '1234567890',
      appId: '1234567890',
      chatId: '1234567890',
      outLinkAuthData: {
        shareId: '1234567890',
        outLinkUid: '1234567890'
      }
    }
  });
export type PresignChatFilePostUrlParams = z.infer<typeof PresignChatFilePostUrlSchema>;
