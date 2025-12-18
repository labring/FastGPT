import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { ChatSourceEnum } from '../../../../core/chat/constants';
import { PaginationSchema, PaginationResponseSchema } from '../../../api';

// Get chat histories schema
export const GetHistoriesBodySchema = PaginationSchema.extend(OutLinkChatAuthSchema.shape).extend({
  appId: z.string().optional().describe('应用ID'),
  source: z.enum(ChatSourceEnum).optional().describe('对话来源'),
  startCreateTime: z.string().optional().describe('创建时间开始'),
  endCreateTime: z.string().optional().describe('创建时间结束'),
  startUpdateTime: z.string().optional().describe('更新时间开始'),
  endUpdateTime: z.string().optional().describe('更新时间结束')
});
export type GetHistoriesBodyType = z.infer<typeof GetHistoriesBodySchema>;
export const GetHistoriesResponseSchema = PaginationResponseSchema(
  z.object({
    chatId: z.string(),
    updateTime: z.date(),
    appId: z.string(),
    customTitle: z.string().optional(),
    title: z.string(),
    top: z.boolean().optional()
  })
);
export type GetHistoriesResponseType = z.infer<typeof GetHistoriesResponseSchema>;

// Update chat history schema
export const UpdateHistoryBodySchema = OutLinkChatAuthSchema.and(
  z.object({
    appId: ObjectIdSchema.describe('应用ID'),
    chatId: z.string().min(1).describe('对话ID'),
    title: z.string().optional().describe('标题'),
    customTitle: z.string().optional().describe('自定义标题'),
    top: z.boolean().optional().describe('是否置顶')
  })
);
export type UpdateHistoryBodyType = z.infer<typeof UpdateHistoryBodySchema>;

// Delete single chat history schema
export const DelChatHistorySchema = OutLinkChatAuthSchema.extend({
  appId: ObjectIdSchema.describe('应用ID'),
  chatId: z.string().min(1).describe('对话ID')
});
export type DelChatHistoryType = z.infer<typeof DelChatHistorySchema>;

// Clear all chat histories schema
export const ClearChatHistoriesSchema = OutLinkChatAuthSchema.extend({
  appId: ObjectIdSchema.describe('应用ID')
});
export type ClearChatHistoriesType = z.infer<typeof ClearChatHistoriesSchema>;

// Batch delete chat histories schema (for log manager)
export const ChatBatchDeleteBodySchema = z.object({
  appId: ObjectIdSchema,
  chatIds: z
    .array(z.string().min(1))
    .min(1)
    .meta({
      description: '对话ID列表',
      example: ['chat_123456', 'chat_789012']
    })
});
export type ChatBatchDeleteBodyType = z.infer<typeof ChatBatchDeleteBodySchema>;
