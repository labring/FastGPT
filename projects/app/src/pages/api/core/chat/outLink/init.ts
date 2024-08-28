import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { InitChatResponse, InitOutLinkChatProps } from '@/global/core/chat/api.d';
import { getGuideModule, getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { getChatModelNameListByModules } from '@/service/core/app/workflow';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getAppLatestVersion } from '@fastgpt/service/core/app/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let { chatId, shareId, outLinkUid } = req.query as InitOutLinkChatProps;

  // auth link permission
  const { shareChat, uid, appId } = await authOutLink({ shareId, outLinkUid });

  // auth app permission
  const [tmb, chat, app] = await Promise.all([
    MongoTeamMember.findById(shareChat.tmbId, '_id userId').populate('userId', 'avatar').lean(),
    MongoChat.findOne({ appId, chatId, shareId }).lean(),
    MongoApp.findById(appId).lean()
  ]);

  if (!app) {
    throw new Error(AppErrEnum.unExist);
  }

  // auth chat permission
  if (chat && chat.outLinkUid !== uid) {
    throw new Error(ChatErrEnum.unAuthChat);
  }

  const [{ histories }, { nodes, chatConfig }] = await Promise.all([
    getChatItems({
      appId: app._id,
      chatId,
      limit: 30,
      field: `dataId obj value userGoodFeedback userBadFeedback ${
        shareChat.responseDetail || app.type === AppTypeEnum.plugin
          ? `adminFeedback ${DispatchNodeResponseKeyEnum.nodeResponse}`
          : ''
      } `
    }),
    getAppLatestVersion(app._id, app)
  ]);

  // pick share response field
  app.type !== AppTypeEnum.plugin &&
    histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({ flowResponses: item.responseData });
      }
    });

  jsonRes<InitChatResponse>(res, {
    data: {
      chatId,
      appId: app._id,
      title: chat?.title,
      //@ts-ignore
      userAvatar: tmb?.userId?.avatar,
      variables: chat?.variables || {},
      history: app.type === AppTypeEnum.plugin ? histories : transformPreviewHistories(histories),
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
        pluginInputs:
          app?.modules?.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)
            ?.inputs ?? []
      }
    }
  });
}

export default NextAPI(handler);

export const config = {
  api: {
    responseLimit: '10mb'
  }
};
