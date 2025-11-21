import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

export const ChatFileUploadSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.date().optional()
});
export type CheckChatFileKeys = z.infer<typeof ChatFileUploadSchema>;

export const DelChatFileByPrefixSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().nonempty().optional(),
  uId: z.string().nonempty().optional()
});
export type DelChatFileByPrefixParams = z.infer<typeof DelChatFileByPrefixSchema>;
