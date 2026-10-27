import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { getAppChatConfig } from '@fastgpt/global/common/app/chat';
import { getChatModelNameListByModules } from '@/service/core/app/workflow';
import {
  InitChatQuerySchema,
  InitChatResponseSchema,
  type InitChatResponseType
} from '@fastgpt/global/openapi/core/chat/controler/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { presignVariablesFileUrls } from '@fastgpt/service/core/chat/utils';
import { MongoAppRecord } from '@fastgpt/service/core/app/record/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isAuxiliaryGenerationSourceType } from '@fastgpt/global/common/chat/source';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { getChatSourceConfig } from '@fastgpt/service/core/chat/config';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { buildChatTargetResponse } from '@fastgpt/global/openapi/core/chat/api';
import {
  ChatAgentHelperAppName,
  ChatAgentHelperAvatar
} from '@fastgpt/global/core/ai/auxiliaryGeneration/chatAgentHelper';
import { getDisplayChatTitle } from '@fastgpt/service/core/chat/title';

/** 统一初始化已授权来源的会话状态；来源差异仅用于解析配置和展示信息。 */
async function handler(req: NextApiRequest): Promise<InitChatResponseType> {
  const { sourceType, sourceId, chatId } = parseApiInput({
    req,
    querySchema: InitChatQuerySchema
  }).query;

  try {
    // 资源权限与会话归属只检查一次，复用已加载的 App/Skill。
    const auth = await authChatTargetCrud({
      req,
      authToken: true,
      authApiKey: true,
      sourceType,
      sourceId,
      chatId
    });
    const { app, skill, chat, teamId } = auth;
    const chatGenerateStatus = chat?.chatGenerateStatus ?? ChatGenerateStatusEnum.done;
    if (chat?.hasBeenRead === false && chatGenerateStatus !== ChatGenerateStatusEnum.generating) {
      await MongoChat.updateOne(
        { ...buildChatSourceQuery({ sourceType, sourceId }), ...auth.scope, chatId },
        { $set: { hasBeenRead: true } }
      );
      chat.hasBeenRead = true;
    }

    const { nodes, chatConfig } = await getChatSourceConfig({ sourceType, sourceId, app });
    const appChatConfig =
      sourceType === ChatSourceTypeEnum.app
        ? getAppChatConfig({
            chatConfig,
            storeVariables: chat?.variableList,
            storeWelcomeText: chat?.welcomeText,
            isPublicFetch: false
          })
        : chatConfig;
    const appInfo = (() => {
      if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
        return {
          name: ChatAgentHelperAppName,
          avatar: ChatAgentHelperAvatar,
          intro: '',
          type: AppTypeEnum.simple
        };
      }
      if (skill) {
        return {
          name: skill.name,
          avatar: skill.avatar ?? '',
          intro: skill.description ?? '',
          type: AppTypeEnum.simple
        };
      }
      if (!app) throw ChatErrEnum.unAuthChat;
      return { name: app.name, avatar: app.avatar ?? '', intro: app.intro ?? '', type: app.type };
    })();
    const isAppChat = sourceType === ChatSourceTypeEnum.app;
    const pluginInputs = isAppChat
      ? (chat?.pluginInputs ??
        nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs ??
        [])
      : [];
    const variables = isAppChat
      ? await presignVariablesFileUrls({
          variables: chat?.variables,
          variableConfig: appChatConfig.variables
        })
      : {};

    return InitChatResponseSchema.parse({
      chatId,
      ...buildChatTargetResponse({ sourceType, sourceId }),
      title: getDisplayChatTitle({ customTitle: chat?.customTitle, title: chat?.title }),
      userAvatar: undefined,
      variables,
      // 保持普通 App/Skill 的旧响应；辅助生成在新会话时明确返回默认状态。
      chatGenerateStatus: isAuxiliaryGenerationSourceType(sourceType)
        ? chatGenerateStatus
        : chat?.chatGenerateStatus,
      hasBeenRead: isAuxiliaryGenerationSourceType(sourceType)
        ? (chat?.hasBeenRead ?? true)
        : chat?.hasBeenRead,
      app: {
        ...appInfo,
        chatConfig: appChatConfig,
        chatModels: isAppChat
          ? await getChatModelNameListByModules(nodes, { teamId: String(teamId) })
          : [],
        pluginInputs
      }
    });
  } catch (error) {
    if (sourceType === ChatSourceTypeEnum.app && error === AppErrEnum.unAuthApp) {
      const { tmbId } = await authCert({ req, authToken: true, authApiKey: true });
      await MongoAppRecord.deleteOne({ tmbId, appId: sourceId });
    }
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
