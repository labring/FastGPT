import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ChatAgentConfigFormDataSchema } from '../../../../core/ai/auxiliaryGeneration/type';

/* ============================================================================
 * API: 加载 Chat Agent 辅助生成配置
 * Route: POST /api/proApi/core/chat/chatAgentHelper/config/load
 * Method: POST
 * Description: 从已鉴权的 AI 消息读取 S3 引用并加载生成配置，供用户重新应用
 * Tags: ['AI Auxiliary']
 * ============================================================================ */
export const ChatAgentConfigLoadBodySchema = z.object({
  appId: ObjectIdSchema.meta({
    description: '应用 ID',
    example: '67f4c91c79a4d61b1f116b2a'
  }),
  chatId: z.string().min(1).meta({
    description: 'Chat Agent 辅助生成会话 ID',
    example: 'helper-chat-id'
  }),
  responseChatItemId: z.string().min(1).meta({
    description: '包含生成配置引用的 AI 消息 dataId',
    example: 'response-chat-item-id'
  })
});
export type ChatAgentConfigLoadBody = z.infer<typeof ChatAgentConfigLoadBodySchema>;

export const ChatAgentConfigLoadResponseSchema = z.object({
  formData: ChatAgentConfigFormDataSchema.meta({ description: '可应用的生成配置' })
});
export type ChatAgentConfigLoadResponse = z.infer<typeof ChatAgentConfigLoadResponseSchema>;
