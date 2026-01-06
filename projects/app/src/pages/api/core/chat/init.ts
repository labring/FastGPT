import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getGuideModule, getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { getChatModelNameListByModules } from '@/service/core/app/workflow';
import type { InitChatResponse } from '@/global/core/chat/api.d';
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
import { InitChatQuerySchema } from '@fastgpt/global/openapi/core/chat/controler/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<InitChatResponse> {
  const { appId, chatId } = InitChatQuerySchema.parse(req.query);

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
      chatId ? MongoChat.findOne({ appId, chatId }) : undefined
    ]);

    // auth chat permission
    if (chat && !app.permission.hasReadChatLogPer && String(tmbId) !== String(chat?.tmbId)) {
      return Promise.reject(ChatErrEnum.unAuthChat);
    }

    // get app and history
    const { nodes, chatConfig } = await getAppLatestVersion(app._id, app);
    const pluginInputs =
      chat?.pluginInputs ??
      nodes?.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs ??
      [];

    const variables = await presignVariablesFileUrls({
      variables: chat?.variables,
      variableConfig: chat?.variableList
    });

    return {
      chatId,
      appId,
      title: chat?.title,
      userAvatar: undefined,
      variables,
      app: {
        chatConfig: getAppChatConfig({
          chatConfig,
          systemConfigNode: getGuideModule(nodes),
          storeVariables: chat?.variableList,
          storeWelcomeText: chat?.welcomeText,
          isPublicFetch: false
        }),
        chatModels: getChatModelNameListByModules(nodes),
        name: app.name,
        avatar: app.avatar,
        intro: app.intro,
        type: app.type,
        pluginInputs
      }
    };
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
