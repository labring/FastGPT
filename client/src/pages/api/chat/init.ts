import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import type { InitChatResponse } from '@/api/response/chat';
import { authUser } from '@/service/utils/auth';
import { ChatItemType } from '@/types/chat';
import { authApp } from '@/service/utils/auth';
import mongoose from 'mongoose';
import type { ChatSchema } from '@/types/mongoSchema';
import { getSpecialModule } from '@/components/ChatBox';
import { TaskResponseKeyEnum } from '@/constants/chat';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
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

    await connectToDatabase();

    // 校验使用权限
    const app = (
      await authApp({
        appId,
        userId,
        authUser: false,
        authOwner: false
      })
    ).app;

    // 历史记录
    const { chat, history = [] }: { chat?: ChatSchema; history?: ChatItemType[] } =
      await (async () => {
        if (chatId) {
          // auth chatId
          const [chat, history] = await Promise.all([
            Chat.findOne({
              chatId,
              userId
            }),
            Chat.aggregate([
              {
                $match: {
                  chatId,
                  userId: new mongoose.Types.ObjectId(userId)
                }
              },
              {
                $project: {
                  content: {
                    $slice: ['$content', -30] // 返回 content 数组的最后 30 个元素
                  }
                }
              },
              { $unwind: '$content' },
              {
                $project: {
                  _id: '$content._id',
                  obj: '$content.obj',
                  value: '$content.value',
                  [TaskResponseKeyEnum.responseData]: `$content.${TaskResponseKeyEnum.responseData}`
                }
              }
            ])
          ]);
          if (!chat) {
            throw new Error('聊天框不存在');
          }
          return { history, chat };
        }
        return {};
      })();

    const isOwner = String(app.userId) === userId;

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId,
        appId,
        app: {
          ...getSpecialModule(app.modules),
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
