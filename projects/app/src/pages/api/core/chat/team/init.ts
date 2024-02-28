import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { InitChatProps, InitChatResponse } from '@/global/core/chat/api.d';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    let { appId, chatId, outLinkUid } = req.query as {
      chatId?: string;
      appId?: string;
      outLinkUid?: string;
    };

    if (!appId) {
      return jsonRes(res, {
        code: 501,
        message: "You don't have an app yet"
      });
    }

    // auth app permission
    const [chat, app] = await Promise.all([
      //   authApp({
      //     req,
      //     authToken: false,
      //     appId,
      //     per: 'r'
      //   }),
      chatId ? MongoChat.findOne({ appId, chatId }) : undefined,
      MongoApp.findById(appId).lean()
    ]);
    if (!app) {
      throw new Error(AppErrEnum.unExist);
    }

    // auth chat permission
    // if (chat && chat.outLinkUid !== outLinkUid) {
    //   throw new Error(ChatErrEnum.unAuthChat);
    // }
    // // auth chat permission
    // if (chat && !app.canWrite && String(tmbId) !== String(chat?.tmbId)) {
    //   throw new Error(ChatErrEnum.unAuthChat);
    // }

    // get app and history
    const { history } = await getChatItems({
      appId,
      chatId,
      limit: 30,
      field: `dataId obj value adminFeedback userBadFeedback userGoodFeedback ${ModuleOutputKeyEnum.responseData}`
    });

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId,
        appId,
        title: chat?.title || '新对话',
        userAvatar: undefined,
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
