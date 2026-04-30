import type { NextApiRequest, NextApiResponse } from 'next';
import { getGuideModule, getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NextAPI } from '@/service/middleware/entry';
import { getRandomUserAvatar } from '@fastgpt/global/support/user/utils';
import { presignVariablesFileUrls } from '@fastgpt/service/core/chat/utils';
import { InitOutLinkChatQuerySchema } from '@fastgpt/global/openapi/core/chat/outLink/api';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chatId, shareId, outLinkUid } = InitOutLinkChatQuerySchema.parse(req.query);

  // auth link permission
  const { uid, appId } = await authOutLink({ shareId, outLinkUid });

  // auth app permission
  const [chat, app] = await Promise.all([
    MongoChat.findOne({ appId, chatId }).lean(),
    MongoApp.findById(appId).lean()
  ]);

  if (!app) {
    throw new Error(AppErrEnum.unExist);
  }

  // auth chat permission
  if (chat && chat.outLinkUid !== uid) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const chatGenerateStatus = chat?.chatGenerateStatus ?? ChatGenerateStatusEnum.done;
  if (chat?.hasBeenRead === false && chatGenerateStatus !== ChatGenerateStatusEnum.generating) {
    await MongoChat.updateOne({ appId, chatId }, { $set: { hasBeenRead: true } });
    chat.hasBeenRead = true;
  }

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
    appId: app._id,
    title: chat?.title || '',
    userAvatar: getRandomUserAvatar(),
    variables,
    chatGenerateStatus: chat?.chatGenerateStatus,
    hasBeenRead: chat?.hasBeenRead,
    app: {
      chatConfig: getAppChatConfig({
        chatConfig,
        systemConfigNode: getGuideModule(nodes),
        storeVariables: chat?.variableList,
        storeWelcomeText: chat?.welcomeText,
        isPublicFetch: false
      }),
      name: app.name,
      avatar: app.avatar,
      intro: app.intro,
      type: app.type,
      pluginInputs
    }
  };
}

export default NextAPI(handler);
