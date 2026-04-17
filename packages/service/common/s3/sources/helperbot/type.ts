import { z } from 'zod';
import { HelperBotTypeEnumSchema } from '@fastgpt/global/core/chat/helperBot/type';

export const HelperBotFileUploadSchema = z.object({
  type: HelperBotTypeEnumSchema,
  chatId: z.string().nonempty(),
  userId: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.date().optional()
});
export type CheckHelperBotFileKeys = z.infer<typeof HelperBotFileUploadSchema>;

export const DelChatFileByPrefixSchema = z.object({
  type: HelperBotTypeEnumSchema,
  chatId: z.string().nonempty().optional(),
  userId: z.string().nonempty().optional()
});
export type DelChatFileByPrefixParams = z.infer<typeof DelChatFileByPrefixSchema>;
