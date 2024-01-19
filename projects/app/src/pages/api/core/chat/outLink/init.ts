import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { InitChatResponse, InitOutLinkChatProps } from '@/global/core/chat/api.d';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { selectShareResponse } from '@/utils/service/core/chat';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

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

    const { history } = await getChatItems({
      appId: app._id,
      chatId,
      limit: 30,
      field: `dataId obj value userGoodFeedback userBadFeedback ${
        shareChat.responseDetail ? `adminFeedback ${ModuleOutputKeyEnum.responseData}` : ''
      } `
    });

    // pick share response field
    history.forEach((item) => {
      item.responseData = selectShareResponse({ responseData: item.responseData });
    });

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId,
        appId: app._id,
        title: chat?.title || '新对话',
        //@ts-ignore
        userAvatar: tmb?.userId?.avatar,
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
