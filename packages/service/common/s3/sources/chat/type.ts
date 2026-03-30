import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { UploadFileByBufferSchema } from '../../type';

export const ChatFileUploadSchema = z.object({
  appId: ObjectIdSchema,
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.date().optional(),
  maxFileSize: z.number().positive().optional()
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
  filename: UploadFileByBufferSchema.shape.filename,
  body: UploadFileByBufferSchema.shape.body,
  contentType: UploadFileByBufferSchema.shape.contentType,
  expiredTime: UploadFileByBufferSchema.shape.expiredTime
});

export type UploadFileParams = z.infer<typeof UploadChatFileSchema>;
