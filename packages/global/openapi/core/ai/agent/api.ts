import { z } from 'zod';
import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { AppQGConfigTypeSchema } from '../../../../core/app/type';
import { ChatMessageSchema } from '../api';
import { createOutLinkChatTargetInputSchema, transformChatAuthTargetInput } from '../../chat/api';

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

/* ============================================================================
 * API: 创建会话问题引导
 * Route: POST /api/core/ai/agent/v2/createQuestionGuide
 * Method: POST
 * Description: 基于指定会话历史生成推荐问题，支持普通 App、外链、团队空间和 Skill Edit 调试
 * Tags: ['AI', 'Agent', 'Chat', 'Read']
 * ============================================================================ */

export const CreateQuestionGuideV2BodyRawSchema = createOutLinkChatTargetInputSchema({
  chatId: z.string().min(1).meta({
    example: 'chat-1',
    description: '会话 ID'
  }),
  questionGuide: AppQGConfigTypeSchema.optional().meta({
    description: '问题引导配置；App 会话未传时使用应用最新版本中的问题引导配置'
  }),
  outLinkAuthData: OutLinkChatAuthSchema.optional().meta({
    description: '外链鉴权数据，兼容旧前端把 shareId/outLinkUid 放在嵌套对象中的传参方式'
  })
}).meta({
  example: {
    appId: '68ad85a7463006c963799a05',
    chatId: 'chat-1',
    questionGuide: {
      open: true,
      model: 'gpt-4o-mini'
    },
    outLinkAuthData: {
      shareId: 'share-1',
      outLinkUid: 'outlink-user-1'
    }
  }
});

export const CreateQuestionGuideV2BodySchema = CreateQuestionGuideV2BodyRawSchema.transform(
  transformChatAuthTargetInput
);

export type CreateQuestionGuideV2BodyType = z.infer<typeof CreateQuestionGuideV2BodyRawSchema>;
export type CreateQuestionGuideV2BodyRuntimeType = z.infer<typeof CreateQuestionGuideV2BodySchema>;
