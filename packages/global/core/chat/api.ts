import { ObjectIdSchema } from 'common/type/mongo';
import type { OutLinkChatAuthProps } from '../../support/permission/chat';
import z from 'zod';

export type UpdateChatFeedbackProps = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  dataId: string;
  userBadFeedback?: string;
  userGoodFeedback?: string;
};

export const PresignChatFileGetUrlSchema = z.object({
  key: z.string().min(1),
  appId: ObjectIdSchema,
  outLinkAuthData: z.record(z.string(), z.any())
});
export type PresignChatFileGetUrlParams = z.infer<typeof PresignChatFileGetUrlSchema> & {
  outLinkAuthData?: OutLinkChatAuthProps;
};

export const PresignChatFilePostUrlSchema = z.object({
  filename: z.string().min(1),
  appId: ObjectIdSchema,
  chatId: ObjectIdSchema,
  outLinkAuthData: z.record(z.string(), z.any())
});
export type PresignChatFilePostUrlParams = z.infer<typeof PresignChatFilePostUrlSchema> & {
  outLinkAuthData?: OutLinkChatAuthProps;
};
