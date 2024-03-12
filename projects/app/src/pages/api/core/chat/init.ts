import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import type { InitChatProps, InitChatResponse } from '@/global/core/chat/api.d';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/module/runtime/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    let { appId, chatId, loadCustomFeedbacks } = req.query as InitChatProps;

    if (!appId) {
      return jsonRes(res, {
        code: 501,
        message: "You don't have an app yet"
      });
    }

    // auth app permission
    const [{ app, tmbId }, chat] = await Promise.all([
      authApp({
        req,
        authToken: true,
        appId,
        per: 'r'
      }),
      chatId ? MongoChat.findOne({ appId, chatId }) : undefined
    ]);

    // auth chat permission
    if (chat && !app.canWrite && String(tmbId) !== String(chat?.tmbId)) {
      throw new Error(ChatErrEnum.unAuthChat);
    }

    // get app and history
    const { history } = await getChatItems({
      appId,
      chatId,
      limit: 30,
      field: `dataId obj value adminFeedback userBadFeedback userGoodFeedback ${
        DispatchNodeResponseKeyEnum.nodeResponse
      } ${loadCustomFeedbacks ? 'customFeedbacks' : ''}`
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
