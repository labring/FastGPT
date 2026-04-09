import type { NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { getGuideModule, getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { getChatModelNameListByModules } from '@/service/core/app/workflow';
import type { InitChatResponse, InitTeamChatProps } from '@/global/core/chat/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { presignVariablesFileUrls } from '@fastgpt/service/core/chat/utils';

async function handler(req: ApiRequestProps<InitTeamChatProps>, res: NextApiResponse) {
  let { teamId, appId, chatId, teamToken } = req.query;

  if (!teamId || !appId || !teamToken) {
    return Promise.reject('teamId, appId, teamToken are required');
  }

  const { uid, tags } = await authTeamSpaceToken({
    teamId,
    teamToken
  });

  const [team, app] = await Promise.all([
    MongoTeam.findById(teamId, 'name avatar').lean(),
    MongoApp.findOne({
      _id: appId,
      teamId,
      $or: [
        { teamTags: { $size: 0 } },
        { teamTags: { $exists: false } },
        { teamTags: { $in: tags } }
      ]
    }).lean()
  ]);

  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  const chat = chatId ? await MongoChat.findOne({ appId, chatId }).lean() : null;

  // auth chat permission
  if (chat && (String(chat.teamId) !== teamId || chat.outLinkUid !== uid)) {
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

  jsonRes<InitChatResponse>(res, {
    data: {
      chatId,
      appId,
      title: chat?.title,
      userAvatar: team?.avatar,
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
    }
  });
}

export default NextAPI(handler);
