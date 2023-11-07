import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { InitChatResponse } from '@fastgpt/global/core/chat/api.d';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import type { ChatSchema } from '@fastgpt/global/core/chat/type.d';
import { getGuideModule } from '@/global/core/app/modules/utils';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import { TaskResponseKeyEnum } from '@fastgpt/global/core/chat/constants';
import { authChat } from '@fastgpt/service/support/permission/auth/chat';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    let { appId, chatId } = req.query as {
      appId: string;
      chatId: '' | string;
    };

    if (!appId) {
      return jsonRes(res, {
        code: 501,
        message: "You don't have an app yet"
      });
    }

    // 校验使用权限
    const [{ app, tmbId }] = await Promise.all([
      authApp({
        req,
        authToken: true,
        appId,
        per: 'r'
      }),
      chatId
        ? authChat({
            req,
            authToken: true,
            chatId
          })
        : undefined
    ]);

    // get app and history
    const { chat, history = [] }: { chat?: ChatSchema; history?: ChatItemType[] } =
      await (async () => {
        if (chatId) {
          // auth chatId
          const [chat, history] = await Promise.all([
            MongoChat.findOne(
              {
                chatId,
                tmbId,
                appId
              },
              'title variables'
            ),
            MongoChatItem.find(
              {
                chatId,
                tmbId,
                appId
              },
              `dataId obj value adminFeedback userFeedback ${TaskResponseKeyEnum.responseData}`
            )
              .sort({ _id: -1 })
              .limit(30)
          ]);
          if (!chat) {
            throw new Error('聊天框不存在');
          }
          history.reverse();
          return { history, chat };
        }
        return {};
      })();

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId,
        appId,
        app: {
          userGuideModule: getGuideModule(app.modules),
          chatModels: getChatModelNameListByModules(app.modules),
          name: app.name,
          avatar: app.avatar,
          intro: app.intro
        },
        title: chat?.title || '新对话',
        variables: chat?.variables || {},
        history
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
