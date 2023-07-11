import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat, App } from '@/service/mongo';
import type { InitChatResponse } from '@/api/response/chat';
import { authUser } from '@/service/utils/auth';
import { ChatItemType } from '@/types/chat';
import { authApp } from '@/service/utils/auth';
import mongoose from 'mongoose';
import type { AppSchema, ChatSchema } from '@/types/mongoSchema';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { SystemInputEnum } from '@/constants/app';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    let { appId, historyId } = req.query as {
      appId: '' | string;
      historyId: '' | string;
    };

    await connectToDatabase();

    // 没有 appId 时，直接获取用户的第一个id
    const app = await (async () => {
      if (!appId) {
        const myModel = await App.findOne({ userId });
        if (!myModel) {
          const { _id } = await App.create({
            name: '应用1',
            userId
          });
          return (await App.findById(_id)) as AppSchema;
        } else {
          return myModel;
        }
      } else {
        // 校验使用权限
        const authRes = await authApp({
          appId,
          userId,
          authUser: false,
          authOwner: false
        });
        return authRes.app;
      }
    })();

    appId = appId || app._id;

    // 历史记录
    const { chat, history = [] }: { chat?: ChatSchema; history?: ChatItemType[] } =
      await (async () => {
        if (historyId) {
          // auth chatId
          const chat = await Chat.findOne({
            _id: historyId,
            userId
          });
          if (!chat) {
            throw new Error('聊天框不存在');
          }
          // 获取 chat.content 数据
          const history = await Chat.aggregate([
            {
              $match: {
                _id: new mongoose.Types.ObjectId(historyId),
                userId: new mongoose.Types.ObjectId(userId)
              }
            },
            {
              $project: {
                content: {
                  $slice: ['$content', -50] // 返回 content 数组的最后50个元素
                }
              }
            },
            { $unwind: '$content' },
            {
              $project: {
                _id: '$content._id',
                obj: '$content.obj',
                value: '$content.value',
                systemPrompt: '$content.systemPrompt',
                quoteLen: { $size: { $ifNull: ['$content.quote', []] } }
              }
            }
          ]);
          return { history, chat };
        }
        return {};
      })();

    const isOwner = String(app.userId) === userId;

    jsonRes<InitChatResponse>(res, {
      data: {
        historyId,
        appId,
        app: {
          variableModules: app.modules
            .find((item) => item.flowType === FlowModuleTypeEnum.userGuide)
            ?.inputs?.find((item) => item.key === SystemInputEnum.variables)?.value,
          welcomeText: app.modules
            .find((item) => item.flowType === FlowModuleTypeEnum.userGuide)
            ?.inputs?.find((item) => item.key === SystemInputEnum.welcomeText)?.value,
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
