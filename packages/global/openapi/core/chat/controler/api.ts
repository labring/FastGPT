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

/** 团队空间 init：`/api/core/chat/team/init` */
export const InitTeamChatQuerySchema = z.object({
  teamId: z.string().min(1),
  appId: z.string().min(1),
  chatId: z.string().optional(),
  teamToken: z.string().min(1)
});
export type InitTeamChatQueryType = z.infer<typeof InitTeamChatQuerySchema>;

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

/* ============ v2/chat/stop ============ */
export const StopV2ChatRawSchema = createChatTargetInputSchema({
  chatId: z.string().min(1).describe('会话ID'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
}).meta({
  example: {
    appId: '1234567890',
    chatId: '1234567890',
    outLinkAuthData: {
      shareId: '1234567890',
      outLinkUid: '1234567890'
    }
  }
});
export const StopV2ChatSchema = StopV2ChatRawSchema.transform(transformChatTargetInput);
export type StopV2ChatParams = z.infer<typeof StopV2ChatRawSchema>;
export type StopV2ChatRuntimeParams = z.infer<typeof StopV2ChatSchema>;

export const StopV2ChatResponseSchema = z
  .object({
    success: z.boolean().describe('是否成功发送停止信号'),
    completed: z.boolean().describe('工作流是否已在本次请求等待窗口内完成停止'),
    chatGenerateStatus: ChatGenerateStatusSchema.optional()
  })
  .meta({
    example: {
      success: true,
      completed: true,
      chatGenerateStatus: ChatGenerateStatusEnum.done
    }
  });
export type StopV2ChatResponse = z.infer<typeof StopV2ChatResponseSchema>;
