import z from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { UploadFileByBodySchema } from '../../contracts/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UploadExtensionRuleSchema, UploadFileHintSchema } from '../../uploadPolicy/type';

export const ChatS3SourceTypeSchema = z.enum([
  ChatSourceTypeEnum.app,
  ChatSourceTypeEnum.skillEdit,
  ChatSourceTypeEnum.chatAgentHelper,
  ChatSourceTypeEnum.workflowBuilder
]);
export type ChatS3SourceType = ChatSourceTypeEnum;

export const ChatFileUploadSchema = z.object({
  sourceType: ChatS3SourceTypeSchema,
  sourceId: ObjectIdSchema,
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  filename: z.string().nonempty(),
  contentType: UploadFileHintSchema.shape.contentType,
  declaredExtension: UploadFileHintSchema.shape.declaredExtension,
  declaredFilename: UploadFileHintSchema.shape.declaredFilename,
  size: UploadFileHintSchema.shape.size,
  expiredTime: z.coerce.date().optional(),
  maxFileSize: z.number().positive().optional(),
  allowedExtensions: z.array(z.string().nonempty()).optional(),
  extensionRules: z.array(UploadExtensionRuleSchema).optional()
});
export type CheckChatFileKeys = Omit<z.input<typeof ChatFileUploadSchema>, 'sourceType'> & {
  sourceType: ChatS3SourceType;
};

export const DelChatFileByPrefixSchema = z.object({
  sourceType: ChatS3SourceTypeSchema,
  sourceId: ObjectIdSchema,
  chatId: z.string().nonempty().optional(),
  uId: z.string().nonempty().optional()
});
export type DelChatFileByPrefixParams = Omit<
  z.input<typeof DelChatFileByPrefixSchema>,
  'sourceType'
> & {
  sourceType: ChatS3SourceType;
};

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

export type UploadFileParams = Omit<z.input<typeof UploadChatFileSchema>, 'sourceType'> & {
  sourceType: ChatS3SourceType;
};
