import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import type { InitShareChatResponse } from '@fastgpt/global/support/outLink/api.d';
import { HUMAN_ICON } from '@fastgpt/global/core/chat/constants';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { authShareChatInit } from '@/service/support/outLink/auth';
import { getChatModelNameListByModules } from '@/service/core/app/module';
import { authOutLinkValid } from '@fastgpt/service/support/permission/auth/outLink';

/* init share chat window */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    let { shareId, authToken } = req.query as {
      shareId: string;
      authToken?: string;
    };

    // get shareChat
    const { app, shareChat } = await authOutLinkValid({ shareId });

    // 校验使用权限
    const [user] = await Promise.all([
      MongoUser.findById(shareChat.userId, 'avatar'),
      authShareChatInit({
        authToken,
        tokenUrl: shareChat.limit?.hookUrl
      })
    ]);

    jsonRes<InitShareChatResponse>(res, {
      data: {
        userAvatar: user?.avatar || HUMAN_ICON,
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
