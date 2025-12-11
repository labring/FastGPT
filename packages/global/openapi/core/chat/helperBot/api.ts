import { PaginationPropsSchema, PaginationResponseSchema } from '../../../type';
import {
  type HelperBotChatItemSiteType,
  HelperBotTypeEnum,
  HelperBotTypeEnumSchema,
  skillEditorParamsSchema,
  topAgentParamsSchema
} from '../../../../core/chat/helperBot/type';
import { z } from 'zod';
import type { PaginationResponse } from '../../../../../web/common/fetch/type';
import { ChatFileTypeEnum } from '../../../../core/chat/constants';

// 分页获取记录
export const GetHelperBotChatRecordsParamsSchema = z
  .object({
    type: HelperBotTypeEnumSchema,
    chatId: z.string()
  })
  .and(PaginationPropsSchema);
export type GetHelperBotChatRecordsParamsType = z.infer<typeof GetHelperBotChatRecordsParamsSchema>;
export type GetHelperBotChatRecordsResponseType = PaginationResponse<HelperBotChatItemSiteType>;

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
    }),
    z.object({
      type: z.literal(HelperBotTypeEnum.skillEditor),
      data: skillEditorParamsSchema
    })
  ])
});
export type HelperBotCompletionsParamsType = z.infer<typeof HelperBotCompletionsParamsSchema>;
