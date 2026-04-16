import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import z from 'zod';
import { AppChatConfigTypeSchema } from '../../../../core/app/type';
import { AppTypeEnum } from '../../../../core/app/constants';
import { FlowNodeInputItemTypeSchema } from '../../../../core/workflow/type/io';
import { ChatGenerateStatusEnum } from '../../../../core/chat/constants';

/* Init */
// Online chat
export const InitChatQuerySchema = z
  .object({
    appId: ObjectIdSchema.describe('应用ID'),
    chatId: z.string().min(1).describe('对话ID'),
    loadCustomFeedbacks: z.coerce.boolean().optional().describe('是否加载自定义反馈')
  })
  .meta({
    example: {
      appId: '1234567890',
      chatId: '1234567890',
      loadCustomFeedbacks: true
    }
  });
export type InitChatQueryType = z.infer<typeof InitChatQuerySchema>;

/** 团队空间 init：`/api/core/chat/team/init` */
export const InitTeamChatQuerySchema = z.object({
  teamId: z.string().min(1),
  appId: z.string().min(1),
  chatId: z.string().optional(),
  teamToken: z.string().min(1)
});
export type InitTeamChatQueryType = z.infer<typeof InitTeamChatQuerySchema>;

export const InitChatResponseSchema = z.object({
  chatId: z.string().optional().describe('对话ID'),
  appId: ObjectIdSchema.describe('应用ID'),
  userAvatar: z.string().optional().describe('用户头像'),
  title: z.string().describe('对话标题'),
  variables: z.record(z.string(), z.any()).optional().describe('全局变量值'),
  chatGenerateStatus: z.nativeEnum(ChatGenerateStatusEnum).optional().describe('对话生成状态'),
  hasBeenRead: z.boolean().optional().describe('是否已读'),
  app: z
    .object({
      chatConfig: AppChatConfigTypeSchema.optional().describe('聊天配置'),
      chatModels: z.array(z.string()).optional().describe('聊天模型'),
      name: z.string().min(1).describe('应用名称'),
      avatar: z.string().describe('应用头像'),
      intro: z.string().describe('应用简介'),
      canUse: z.boolean().optional().describe('是否可用'),
      type: z.enum(AppTypeEnum).describe('应用类型'),
      pluginInputs: z.array(FlowNodeInputItemTypeSchema).describe('插件输入')
    })
    .describe('应用配置')
});
export type InitChatResponseType = z.infer<typeof InitChatResponseSchema>;

/* ============ v2/chat/stop ============ */
export const StopV2ChatSchema = z
  .object({
    appId: ObjectIdSchema.describe('应用ID'),
    chatId: z.string().min(1).describe('对话ID'),
    outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
  })
  .meta({
    example: {
      appId: '1234567890',
      chatId: '1234567890',
      outLinkAuthData: {
        shareId: '1234567890',
        outLinkUid: '1234567890'
      }
    }
  });
export type StopV2ChatParams = z.infer<typeof StopV2ChatSchema>;

export const StopV2ChatResponseSchema = z
  .object({
    success: z.boolean().describe('是否成功停止')
  })
  .meta({
    example: {
      success: true
    }
  });
export type StopV2ChatResponse = z.infer<typeof StopV2ChatResponseSchema>;
