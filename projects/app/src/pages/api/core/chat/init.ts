import type { NextApiRequest } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getGuideModule, getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { getChatModelNameListByModules } from '@/service/core/app/workflow';
import {
  InitChatQuerySchema,
  InitChatResponseSchema,
  type InitChatResponseType
} from '@fastgpt/global/openapi/core/chat/controler/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { presignVariablesFileUrls } from '@fastgpt/service/core/chat/utils';
import { MongoAppRecord } from '@fastgpt/service/core/app/record/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { AppTypeEnum, defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import { buildChatTargetResponse } from '@fastgpt/global/openapi/core/chat/api';

async function handler(req: NextApiRequest): Promise<InitChatResponseType> {
  const { sourceType, sourceId, chatId } = parseApiInput({
    req,
    querySchema: InitChatQuerySchema
  }).query;

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    const [{ skill }, chat] = await Promise.all([
      authSkill({
        req,
        authToken: true,
        authApiKey: true,
        skillId: sourceId,
        per: ReadPermissionVal
      }),
      chatId
        ? MongoChat.findOne({ ...buildChatSourceQuery({ sourceType, sourceId }), chatId })
        : undefined
    ]);

    if (chat && String(chat.teamId) !== String(skill.teamId)) {
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    const chatGenerateStatus = chat?.chatGenerateStatus ?? ChatGenerateStatusEnum.done;
    if (chat?.hasBeenRead === false && chatGenerateStatus !== ChatGenerateStatusEnum.generating) {
      await MongoChat.updateOne(
        { ...buildChatSourceQuery({ sourceType, sourceId }), chatId },
        { $set: { hasBeenRead: true } }
      );
      chat.hasBeenRead = true;
    }

    return InitChatResponseSchema.parse({
      chatId,
      ...buildChatTargetResponse({ sourceType, sourceId }),
      title: chat?.title || '',
      userAvatar: undefined,
      variables: {},
      chatGenerateStatus: chat?.chatGenerateStatus,
      hasBeenRead: chat?.hasBeenRead,
      app: {
        chatConfig: {
          fileSelectConfig: {
            maxFiles: 10,
            canSelectFile: false,
            canSelectImg: false,
            customPdfParse: false,
            canSelectVideo: false,
            canSelectAudio: false,
            canSelectCustomFileExtension: false,
            customFileExtensionList: []
          }
        },
        chatModels: [],
        name: skill.name,
        avatar: skill.avatar || '',
        intro: skill.description || '',
        type: AppTypeEnum.simple,
        pluginInputs: []
      }
    });
  }

  if (sourceType === ChatSourceTypeEnum.helperBot) {
    const [{ teamId, tmbId, permission }, chat] = await Promise.all([
      authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId: sourceId,
        per: ReadPermissionVal
      }),
      chatId
        ? MongoChat.findOne({ ...buildChatSourceQuery({ sourceType, sourceId }), chatId })
        : undefined
    ]);

    if (chat) {
      if (String(chat.teamId) !== String(teamId)) {
        return Promise.reject(ChatErrEnum.unAuthChat);
      }

      if (!permission.hasReadChatLogPer && String(chat.tmbId) !== String(tmbId)) {
        return Promise.reject(ChatErrEnum.unAuthChat);
      }
    }

    const chatGenerateStatus = chat?.chatGenerateStatus ?? ChatGenerateStatusEnum.done;
    if (chat?.hasBeenRead === false && chatGenerateStatus !== ChatGenerateStatusEnum.generating) {
      await MongoChat.updateOne(
        { ...buildChatSourceQuery({ sourceType, sourceId }), chatId },
        { $set: { hasBeenRead: true } }
      );
      chat.hasBeenRead = true;
    }

    return InitChatResponseSchema.parse({
      chatId,
      ...buildChatTargetResponse({ sourceType, sourceId }),
      title: chat?.title || '',
      userAvatar: undefined,
      variables: {},
      chatGenerateStatus,
      hasBeenRead: chat?.hasBeenRead ?? true,
      app: {
        chatConfig: {
          fileSelectConfig: {
            ...defaultAppSelectFileConfig,
            maxFiles: 10,
            canSelectFile: true,
            canSelectImg: true,
            customPdfParse: false,
            canSelectVideo: true,
            canSelectAudio: true,
            canSelectCustomFileExtension: true,
            customFileExtensionList: []
          }
        },
        chatModels: [],
        name: 'Top Agent',
        avatar: '/imgs/bot.svg',
        intro: '',
        type: AppTypeEnum.simple,
        pluginInputs: []
      }
    });
  }

  if (sourceType !== ChatSourceTypeEnum.app) {
    const exhaustiveCheck: never = sourceType;
    throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
  }
  const appId = sourceId;

  try {
    // auth app permission
    const [{ app, tmbId }, chat] = await Promise.all([
      authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId,
        per: ReadPermissionVal
      }),
      chatId
        ? MongoChat.findOne({ ...buildChatSourceQuery({ sourceType, sourceId }), chatId })
        : undefined
    ]);

    // auth chat permission
    if (chat && !app.permission.hasReadChatLogPer && String(tmbId) !== String(chat?.tmbId)) {
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    const chatGenerateStatus = chat?.chatGenerateStatus ?? ChatGenerateStatusEnum.done;
    if (chat?.hasBeenRead === false && chatGenerateStatus !== ChatGenerateStatusEnum.generating) {
      await MongoChat.updateOne(
        { ...buildChatSourceQuery({ sourceType, sourceId }), chatId },
        { $set: { hasBeenRead: true } }
      );
      chat.hasBeenRead = true;
    }

    // get app and history
    const { nodes, chatConfig } = await getAppLatestVersion(app._id, app);
    const systemConfigNode = getGuideModule(nodes);
    const appChatConfig = getAppChatConfig({
      chatConfig,
      systemConfigNode,
      storeVariables: chat?.variableList,
      storeWelcomeText: chat?.welcomeText,
      isPublicFetch: false
    });
    const pluginInputs =
      chat?.pluginInputs ??
      nodes?.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs ??
      [];

    const variables = await presignVariablesFileUrls({
      variables: chat?.variables,
      variableConfig: appChatConfig.variables
    });

    return InitChatResponseSchema.parse({
      chatId,
      ...buildChatTargetResponse({ sourceType, sourceId }),
      title: chat?.title || '',
      userAvatar: undefined,
      variables,
      chatGenerateStatus: chat?.chatGenerateStatus,
      hasBeenRead: chat?.hasBeenRead,
      app: {
        chatConfig: appChatConfig,
        chatModels: getChatModelNameListByModules(nodes),
        name: app.name,
        avatar: app.avatar,
        intro: app.intro,
        type: app.type,
        pluginInputs
      }
    });
  } catch (error: any) {
    if (error === AppErrEnum.unAuthApp && appId) {
      const { tmbId } = await authCert({
        req,
        authToken: true,
        authApiKey: true
      });

      await MongoAppRecord.deleteOne({
        tmbId,
        appId
      });
    }

    return Promise.reject(error);
  }
}

export default NextAPI(handler);
