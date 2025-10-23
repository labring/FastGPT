import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';

export const CheckChatFileKeysSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().length(24),
  uId: z.string().min(1).max(24),
  filename: z.string().min(1)
});
export type CheckChatFileKeys = z.infer<typeof CheckChatFileKeysSchema>;
