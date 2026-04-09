import { z } from 'zod';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { ChatMessageSchema } from '../api';

/* ============================================================================
 * API: 创建问题引导
 * Route: POST /api/core/ai/agent/createQuestionGuide
 * Method: POST
 * Description: 根据对话历史生成推荐的引导问题列表
 * Tags: ['AI', 'Agent', 'Read']
 * ============================================================================ */

export const CreateQuestionGuideBodySchema = OutLinkChatAuthSchema.extend({
  messages: z.array(ChatMessageSchema).meta({
    description: '对话历史消息列表'
  })
});

export type CreateQuestionGuideBodyType = z.infer<typeof CreateQuestionGuideBodySchema>;

export const CreateQuestionGuideResponseSchema = z.array(z.string()).meta({
  example: ['你能帮我做什么？', '如何使用这个功能？'],
  description: '推荐的引导问题列表'
});

export type CreateQuestionGuideResponseType = z.infer<typeof CreateQuestionGuideResponseSchema>;
