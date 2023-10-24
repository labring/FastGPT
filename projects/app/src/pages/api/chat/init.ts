import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat, ChatItem, connectToDatabase } from '@/service/mongo';
import type { InitChatResponse } from '@/global/core/api/chatRes.d';
import { authUser } from '@fastgpt/service/support/user/auth';
import { ChatItemType } from '@/types/chat';
import { authApp } from '@/service/utils/auth';
import type { ChatSchema } from '@/types/mongoSchema';
import { getGuideModule } from '@/global/core/app/modules/utils';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import { TaskResponseKeyEnum } from '@/constants/chat';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });

    let { appId, chatId } = req.query as {
      appId: '' | string;
      chatId: '' | string;
    };

    if (!appId) {
      return jsonRes(res, {
        code: 501,
        message: "You don't have an app yet"
      });
    }

    // 校验使用权限
    const app = (
      await authApp({
        appId,
        userId,
        authUser: false,
        authOwner: false
      })
    ).app;

    // get app and history
    const { chat, history = [] }: { chat?: ChatSchema; history?: ChatItemType[] } =
      await (async () => {
        if (chatId) {
          // auth chatId
          const [chat, history] = await Promise.all([
            Chat.findOne(
              {
                chatId,
                userId,
                appId
              },
              'title variables'
            ),
            ChatItem.find(
              {
                chatId,
                userId,
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
          return { app, history, chat };
        }
        return {};
      })();

    if (!app) {
      throw new Error('Auth App Error');
    }

    const isOwner = String(app.userId) === userId;

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId,
        appId,
        app: {
          userGuideModule: getGuideModule(app.modules),
          chatModels: getChatModelNameListByModules(app.modules),
          name: app.name,
          avatar: app.avatar,
          intro: app.intro,
          canUse: app.share.isShare || isOwner
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
