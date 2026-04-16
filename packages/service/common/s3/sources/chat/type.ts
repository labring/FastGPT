import z from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { UploadFileByBodySchema } from '../../contracts/type';

export const ChatFileUploadSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.coerce.date().optional(),
  maxFileSize: z.number().positive().optional(),
  allowedExtensions: z.array(z.string().nonempty()).optional()
});
export type CheckChatFileKeys = z.infer<typeof ChatFileUploadSchema>;

export const DelChatFileByPrefixSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().nonempty().optional(),
  uId: z.string().nonempty().optional()
});
export type DelChatFileByPrefixParams = z.infer<typeof DelChatFileByPrefixSchema>;

export const UploadChatFileSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  filename: UploadFileByBodySchema.shape.filename,
  body: UploadFileByBodySchema.shape.body,
  contentType: UploadFileByBodySchema.shape.contentType,
  expiredTime: UploadFileByBodySchema.shape.expiredTime
});

export type UploadFileParams = z.infer<typeof UploadChatFileSchema>;
