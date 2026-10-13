import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import z from 'zod';
import { AppTypeEnum } from '../../../../core/app/constants';
import { ChatGenerateStatusEnum } from '../../../../core/chat/constants';
import { OpenAPIFlowNodeInputItemTypeSchema } from '../../workflow/node';
import { OpenAPIAppChatConfigSchema } from '../../app/common/api';
import {
  ChatGenerateStatusSchema,
  createChatTargetInputSchema,
  createChatTargetResponseSchema,
  createOutLinkChatTargetInputSchema,
  transformChatAuthTargetInput,
  transformChatTargetInput
} from '../api';

/* Init */
// Online chat
export const InitChatQueryRawSchema = createChatTargetInputSchema({
  chatId: z.string().min(1).describe('会话ID'),
  loadCustomFeedbacks: z.coerce.boolean().optional().describe('是否加载自定义反馈')
}).meta({
  example: {
    appId: '1234567890',
    chatId: '1234567890',
    loadCustomFeedbacks: true
  }
});
export const InitChatQuerySchema = InitChatQueryRawSchema.transform(transformChatTargetInput);
export type InitChatQueryType = z.infer<typeof InitChatQueryRawSchema>;
export type InitChatQueryRuntimeType = z.infer<typeof InitChatQuerySchema>;

export const InitChatResponseSchema = createChatTargetResponseSchema({
  chatId: z.string().optional().describe('会话ID'),
  userAvatar: z.string().optional().describe('用户头像'),
  title: z.string().describe('对话标题'),
  variables: z.record(z.string(), z.any()).optional().describe('全局变量值'),
  chatGenerateStatus: ChatGenerateStatusSchema.optional(),
  hasBeenRead: z.boolean().optional().describe('是否已读'),
  app: z
    .object({
      chatConfig: OpenAPIAppChatConfigSchema.optional().describe('聊天配置'),
      chatModels: z.array(z.string()).optional().describe('聊天模型'),
      name: z.string().min(1).describe('应用名称'),
      avatar: z.string().describe('应用头像'),
      intro: z.string().describe('应用简介'),
      canUse: z.boolean().optional().describe('是否可用'),
      type: z.enum(AppTypeEnum).describe('应用类型'),
      pluginInputs: z.array(OpenAPIFlowNodeInputItemTypeSchema).describe('插件输入'),
      useAgentSandbox: z.boolean().optional().describe('是否使用虚拟机')
    })
    .describe('应用配置')
});
export type InitChatResponseType = z.infer<typeof InitChatResponseSchema>;

/* ============================================================================
 * API: 停止会话
 * Route: POST /api/v2/chat/stop
 * Method: POST
 * Description: 写入会话停止标记并立即返回，由客户端在确认写入成功后中断当前流式请求
 * Tags: ['Chat', 'Workflow', 'Write']
 * ============================================================================ */
export const StopV2ChatRawSchema = createOutLinkChatTargetInputSchema({
  chatId: z.string().min(1).describe('会话ID'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
}).meta({
  example: {
    chatId: '1234567890',
    outLinkAuthData: {
      shareId: '1234567890',
      outLinkUid: '1234567890'
    }
  }
});
export const StopV2ChatSchema = StopV2ChatRawSchema.transform(transformChatAuthTargetInput);
export type StopV2ChatParams = z.infer<typeof StopV2ChatRawSchema>;
export type StopV2ChatRuntimeParams = z.infer<typeof StopV2ChatSchema>;

export const StopV2ChatResponseSchema = z
  .object({
    success: z.boolean().meta({
      description: '是否成功写入停止信号',
      example: true
    }),
    completed: z.boolean().meta({
      description: '是否已确认工作流完成停止；接口不等待后台收尾，因此当前固定为 false',
      example: false,
      deprecated: true
    }),
    chatGenerateStatus: ChatGenerateStatusSchema.optional().meta({
      description: '兼容旧客户端的保守生成状态；不表示后台工作流仍会继续调度新节点',
      example: ChatGenerateStatusEnum.generating,
      deprecated: true
    })
  })
  .meta({
    example: {
      success: true,
      completed: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    }
  });
export type StopV2ChatResponse = z.infer<typeof StopV2ChatResponseSchema>;
