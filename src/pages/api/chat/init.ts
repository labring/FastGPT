import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import type { InitChatResponse } from '@/api/response/chat';
import { authToken } from '@/service/utils/auth';
import { ChatItemType } from '@/types/chat';
import { authModel } from '@/service/utils/auth';
import mongoose from 'mongoose';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;
    const userId = await authToken(authorization);

    const { modelId, chatId } = req.query as { modelId: string; chatId: '' | string };

    if (!modelId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 获取 model 数据
    const { model } = await authModel({ modelId, userId, authUser: false, authOwner: false });

    // 历史记录
    let history: ChatItemType[] = [];

    if (chatId) {
      // 获取 chat.content 数据
      history = await Chat.aggregate([
        {
          $match: {
            _id: new mongoose.Types.ObjectId(chatId),
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
            systemPrompt: '$content.systemPrompt'
          }
        }
      ]);
    }

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId: chatId || '',
        modelId: modelId,
        name: model.name,
        avatar: model.avatar,
        intro: model.share.intro,
        chatModel: model.chat.chatModel,
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
