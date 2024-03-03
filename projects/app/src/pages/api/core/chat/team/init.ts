import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { InitChatResponse, InitTeamChatProps } from '@/global/core/chat/api.d';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { selectSimpleChatResponse } from '@/utils/service/core/chat';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    let { teamId, appId, chatId, teamToken } = req.query as InitTeamChatProps;

    if (!teamId || !appId || !teamToken) {
      throw new Error('teamId, appId, teamToken are required');
    }

    const { uid } = await authTeamSpaceToken({
      teamId,
      teamToken
    });

    const [team, chat, app] = await Promise.all([
      MongoTeam.findById(teamId, 'name avatar').lean(),
      MongoChat.findOne({ teamId, appId, chatId }).lean(),
      MongoApp.findById(appId).lean()
    ]);

    if (!app) {
      throw new Error(AppErrEnum.unExist);
    }

    // auth chat permission
    if (chat && chat.outLinkUid !== uid) {
      throw new Error(ChatErrEnum.unAuthChat);
    }

    // get app and history
    const { history } = await getChatItems({
      appId,
      chatId,
      limit: 30,
      field: `dataId obj value userGoodFeedback userBadFeedback adminFeedback ${ModuleOutputKeyEnum.responseData}`
    });

    // pick share response field
    history.forEach((item) => {
      item.responseData = selectSimpleChatResponse({ responseData: item.responseData });
    });

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId,
        appId,
        title: chat?.title || '新对话',
        userAvatar: team?.avatar,
        variables: chat?.variables || {},
        history,
        app: {
          userGuideModule: getGuideModule(app.modules),
          chatModels: getChatModelNameListByModules(app.modules),
          name: app.name,
          avatar: app.avatar,
          intro: app.intro
        }
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export const config = {
  api: {
    responseLimit: '10mb'
  }
};
