import z from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { UploadFileByBodySchema } from '../../contracts/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

export const ChatS3SourceTypeSchema = z.enum(ChatSourceTypeEnum);
export type ChatS3SourceType = z.infer<typeof ChatS3SourceTypeSchema>;

export const ChatFileUploadSchema = z.object({
  sourceType: ChatS3SourceTypeSchema,
  sourceId: ObjectIdSchema,
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  filename: z.string().nonempty(),
  expiredTime: z.coerce.date().optional(),
  maxFileSize: z.number().positive().optional(),
  allowedExtensions: z.array(z.string().nonempty()).optional()
});
export type CheckChatFileKeys = z.input<typeof ChatFileUploadSchema>;

export const DelChatFileByPrefixSchema = z.object({
  sourceType: ChatS3SourceTypeSchema,
  sourceId: ObjectIdSchema,
  chatId: z.string().nonempty().optional(),
  uId: z.string().nonempty().optional()
});
export type DelChatFileByPrefixParams = z.input<typeof DelChatFileByPrefixSchema>;

export const UploadChatFileSchema = z.object({
  sourceType: ChatS3SourceTypeSchema,
  sourceId: ObjectIdSchema,
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  filename: UploadFileByBodySchema.shape.filename,
  body: UploadFileByBodySchema.shape.body,
  contentType: UploadFileByBodySchema.shape.contentType,
  expiredTime: UploadFileByBodySchema.shape.expiredTime
});

export type UploadFileParams = z.input<typeof UploadChatFileSchema>;
