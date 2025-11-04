import type { OutLinkChatAuthType } from '../../support/permission/chat/type';
import { OutLinkChatAuthSchema } from '../../support/permission/chat/type';
import { ObjectIdSchema } from '../../common/type/mongo';
import z from 'zod';

export const PresignChatFileGetUrlSchema = z
  .object({
    key: z.string().min(1),
    appId: ObjectIdSchema,
    outLinkAuthData: OutLinkChatAuthSchema.optional()
  })
  .meta({
    description: '获取对话文件预览链接',
    example: {
      key: '1234567890',
      appId: '1234567890',
      outLinkAuthData: {
        shareId: '1234567890',
        outLinkUid: '1234567890'
      }
    }
  });
export type PresignChatFileGetUrlParams = z.infer<typeof PresignChatFileGetUrlSchema> & {
  outLinkAuthData?: OutLinkChatAuthType;
};

export const PresignChatFilePostUrlSchema = z
  .object({
    filename: z.string().min(1),
    appId: ObjectIdSchema,
    chatId: ObjectIdSchema,
    outLinkAuthData: OutLinkChatAuthSchema.optional()
  })
  .meta({
    description: '获取上传对话文件预签名 URL',
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
export type PresignChatFilePostUrlParams = z.infer<typeof PresignChatFilePostUrlSchema> & {
  outLinkAuthData?: OutLinkChatAuthType;
};

export const UpdateChatFeedbackSchema = z
  .object({
    appId: z.string().min(1),
    chatId: z.string().min(1),
    dataId: z.string().min(1),
    userBadFeedback: z.string().optional(),
    userGoodFeedback: z.string().optional()
  })
  .meta({
    description: '更新对话反馈',
    example: {
      appId: '1234567890',
      chatId: '1234567890',
      dataId: '1234567890',
      userBadFeedback: '1234567890',
      userGoodFeedback: '1234567890'
    }
  });
export type UpdateChatFeedbackProps = z.infer<typeof UpdateChatFeedbackSchema>;
