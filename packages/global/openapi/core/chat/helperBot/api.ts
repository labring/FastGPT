import { PaginationResponseSchema } from '../../../api';
import { PaginationSchema } from '../../../api';
import {
  HelperBotChatItemSiteSchema,
  type HelperBotChatItemSiteType,
  HelperBotTypeEnum,
  HelperBotTypeEnumSchema
} from '../../../../core/chat/helperBot/type';
import { topAgentParamsSchema } from '../../../../core/chat/helperBot/topAgent/type';
import { z } from 'zod';
import type { PaginationResponse } from '../../../../../web/common/fetch/type';
import { ChatFileTypeEnum } from '../../../../core/chat/constants';

// 分页获取记录
export const GetHelperBotChatRecordsParamsSchema = PaginationSchema.extend({
  type: HelperBotTypeEnumSchema,
  chatId: z.string()
});
export type GetHelperBotChatRecordsParamsType = z.infer<typeof GetHelperBotChatRecordsParamsSchema>;
export const GetHelperBotChatRecordsResponseSchema = PaginationResponseSchema(
  HelperBotChatItemSiteSchema
);
export type GetHelperBotChatRecordsResponseType = z.infer<
  typeof GetHelperBotChatRecordsResponseSchema
>;

// 删除单组对话
export const DeleteHelperBotChatParamsSchema = z.object({
  type: HelperBotTypeEnumSchema,
  chatId: z.string(),
  chatItemId: z.string()
});
export type DeleteHelperBotChatParamsType = z.infer<typeof DeleteHelperBotChatParamsSchema>;

// 获取文件上传签名
export const GetHelperBotFilePresignParamsSchema = z.object({
  type: HelperBotTypeEnumSchema,
  chatId: z.string(),
  filename: z.string()
});
export type GetHelperBotFilePresignParamsType = z.infer<typeof GetHelperBotFilePresignParamsSchema>;

// 获取文件预览链接
export const GetHelperBotFilePreviewParamsSchema = z.object({
  key: z.string().min(1)
});
export type GetHelperBotFilePreviewParamsType = z.infer<typeof GetHelperBotFilePreviewParamsSchema>;
export const GetHelperBotFilePreviewResponseSchema = z.string();

export const HelperBotCompletionsParamsSchema = z.object({
  chatId: z.string(),
  chatItemId: z.string(),
  query: z.string(),
  files: z.array(
    z.object({
      type: z.enum(ChatFileTypeEnum),
      key: z.string(),
      url: z.string().optional(),
      name: z.string()
    })
  ),
  metadata: z.discriminatedUnion('type', [
    z.object({
      type: z.literal(HelperBotTypeEnum.topAgent),
      data: topAgentParamsSchema
    })
  ])
});
export type HelperBotCompletionsParamsType = z.infer<typeof HelperBotCompletionsParamsSchema>;
