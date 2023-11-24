import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { InitChatResponse } from '@fastgpt/global/core/chat/api.d';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import { authChat } from '@fastgpt/service/support/permission/auth/chat';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

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
    const [{ app }, autChatResult] = await Promise.all([
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
            chatId,
            per: 'r'
          })
        : undefined
    ]);

    // get app and history
    const { history = [] }: { history?: ChatItemType[] } = await (async () => {
      if (chatId) {
        // auth chatId
        const history = await MongoChatItem.find(
          {
            chatId
          },
          `dataId obj value adminFeedback userFeedback ${ModuleOutputKeyEnum.responseData}`
        )
          .sort({ _id: -1 })
          .limit(30);

        history.reverse();
        return { history };
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
        title: autChatResult?.chat?.title || '新对话',
        variables: autChatResult?.chat?.variables || {},
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
