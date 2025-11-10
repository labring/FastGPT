import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

export const ChatFileUploadSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().length(24),
  uId: z.string().nonempty(),
  filename: z.string().nonempty()
});
export type CheckChatFileKeys = z.infer<typeof ChatFileUploadSchema>;

export const DelChatFileByPrefixSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().length(24).optional(),
  uId: z.string().nonempty().optional()
});
export type DelChatFileByPrefixParams = z.infer<typeof DelChatFileByPrefixSchema>;
