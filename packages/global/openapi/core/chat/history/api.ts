import z from 'zod';
import { ChatSourceEnum } from '../../../../core/chat/constants';
import { PaginationSchema, PaginationResponseSchema } from '../../../api';
import {
  ChatGenerateStatusSchema,
  createChatTargetInputSchema,
  createOptionalOutLinkChatTargetInputSchema,
  createOutLinkChatTargetInputSchema,
  refineOptionalChatTargetInput,
  transformChatTargetInput,
  transformOptionalChatTargetInput
} from '../api';

// Get chat sessions schema
const GetHistoriesPropsSchema = {
  source: z.enum(ChatSourceEnum).optional().describe('对话来源'),
  startCreateTime: z.string().optional().describe('创建时间开始'),
  endCreateTime: z.string().optional().describe('创建时间结束'),
  startUpdateTime: z.string().optional().describe('更新时间开始'),
  endUpdateTime: z.string().optional().describe('更新时间结束')
};
export const GetHistoriesBodyRawSchema = PaginationSchema.extend(
  createOptionalOutLinkChatTargetInputSchema(GetHistoriesPropsSchema).shape
).superRefine(refineOptionalChatTargetInput);
export const GetHistoriesBodySchema = GetHistoriesBodyRawSchema.transform(
  transformOptionalChatTargetInput
);
export type GetHistoriesBodyType = z.infer<typeof GetHistoriesBodyRawSchema>;
export type GetHistoriesBodyRuntimeType = z.infer<typeof GetHistoriesBodySchema>;

export const GetHistoriesResponseSchema = PaginationResponseSchema(
  z.object({
    chatId: z.string(),
    updateTime: z.coerce.date(),
    appId: z.string(),
    customTitle: z.string().optional(),
    title: z.string(),
    top: z.boolean().optional(),
    chatGenerateStatus: ChatGenerateStatusSchema.optional(),
    hasBeenRead: z.boolean().optional()
  })
);
export type GetHistoriesResponseType = z.infer<typeof GetHistoriesResponseSchema>;

const GetHistoryStatusPropsSchema = {
  chatIds: z.array(z.string().min(1)).min(1).max(200).describe('需要刷新状态的会话 ID 列表')
};
export const GetHistoryStatusBodyRawSchema = createOutLinkChatTargetInputSchema(
  GetHistoryStatusPropsSchema
);
export const GetHistoryStatusBodySchema =
  GetHistoryStatusBodyRawSchema.transform(transformChatTargetInput);
export type GetHistoryStatusBodyType = z.infer<typeof GetHistoryStatusBodyRawSchema>;
export type GetHistoryStatusBodyRuntimeType = z.infer<typeof GetHistoryStatusBodySchema>;

export const GetHistoryStatusResponseSchema = z.object({
  list: z.array(
    z.object({
      chatId: z.string(),
      updateTime: z.coerce.date(),
      chatGenerateStatus: ChatGenerateStatusSchema.optional(),
      hasBeenRead: z.boolean().optional()
    })
  )
});
export type GetHistoryStatusResponseType = z.infer<typeof GetHistoryStatusResponseSchema>;

const MarkChatReadPropsSchema = {
  chatId: z.string().min(1).describe('会话ID')
};
export const MarkChatReadBodyRawSchema =
  createOutLinkChatTargetInputSchema(MarkChatReadPropsSchema);
export const MarkChatReadBodySchema = MarkChatReadBodyRawSchema.transform(transformChatTargetInput);
export type MarkChatReadBodyType = z.infer<typeof MarkChatReadBodyRawSchema>;
export type MarkChatReadBodyRuntimeType = z.infer<typeof MarkChatReadBodySchema>;

// Update chat session schema
const UpdateHistoryPropsSchema = {
  chatId: z.string().min(1).describe('会话ID'),
  title: z.string().optional().describe('标题'),
  customTitle: z.string().optional().describe('自定义标题'),
  top: z.boolean().optional().describe('是否置顶')
};
export const UpdateHistoryBodyRawSchema =
  createOutLinkChatTargetInputSchema(UpdateHistoryPropsSchema);
export const UpdateHistoryBodySchema =
  UpdateHistoryBodyRawSchema.transform(transformChatTargetInput);
export type UpdateHistoryBodyType = z.infer<typeof UpdateHistoryBodyRawSchema>;
export type UpdateHistoryBodyRuntimeType = z.infer<typeof UpdateHistoryBodySchema>;

// Delete single chat session schema
export const DelChatHistoryRawSchema = createOptionalOutLinkChatTargetInputSchema({
  chatId: z.string().min(1).describe('会话ID')
});
export const DelChatHistorySchema = DelChatHistoryRawSchema.transform(
  transformOptionalChatTargetInput
);
export type DelChatHistoryType = z.infer<typeof DelChatHistoryRawSchema>;
export type DelChatHistoryRuntimeType = z.infer<typeof DelChatHistorySchema>;

// Clear all chat sessions schema
export const ClearChatHistoriesRawSchema = createOptionalOutLinkChatTargetInputSchema({});
export const ClearChatHistoriesSchema = ClearChatHistoriesRawSchema.transform(
  transformOptionalChatTargetInput
);
export type ClearChatHistoriesType = z.infer<typeof ClearChatHistoriesRawSchema>;
export type ClearChatHistoriesRuntimeType = z.infer<typeof ClearChatHistoriesSchema>;

// Batch delete chat sessions schema (for log manager)
export const ChatBatchDeleteBodyRawSchema = createChatTargetInputSchema({
  chatIds: z
    .array(z.string().min(1))
    .min(1)
    .meta({
      description: '会话 ID 列表',
      example: ['chat_123456', 'chat_789012']
    })
});
export const ChatBatchDeleteBodySchema =
  ChatBatchDeleteBodyRawSchema.transform(transformChatTargetInput);
export type ChatBatchDeleteBodyType = z.infer<typeof ChatBatchDeleteBodyRawSchema>;
export type ChatBatchDeleteBodyRuntimeType = z.infer<typeof ChatBatchDeleteBodySchema>;
