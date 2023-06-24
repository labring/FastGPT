import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat, Model } from '@/service/mongo';
import type { InitChatResponse } from '@/api/response/chat';
import { authUser } from '@/service/utils/auth';
import { ChatItemType } from '@/types/chat';
import { authModel } from '@/service/utils/auth';
import mongoose from 'mongoose';
import type { ModelSchema } from '@/types/mongoSchema';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    let { modelId, chatId } = req.query as {
      modelId: '' | string;
      chatId: '' | string;
    };

    await connectToDatabase();

    // 没有 modelId 时，直接获取用户的第一个id
    const model = await (async () => {
      if (!modelId) {
        const myModel = await Model.findOne({ userId });
        if (!myModel) {
          const { _id } = await Model.create({
            name: '应用1',
            userId
          });
          return (await Model.findById(_id)) as ModelSchema;
        } else {
          return myModel;
        }
      } else {
        // 校验使用权限
        const authRes = await authModel({
          modelId,
          userId,
          authUser: false,
          authOwner: false
        });
        return authRes.model;
      }
    })();

    modelId = modelId || model._id;

    // 历史记录
    let history: ChatItemType[] = [];

    if (chatId) {
      // auth chatId
      const chat = await Chat.countDocuments({
        _id: chatId,
        userId
      });
      if (chat === 0) {
        throw new Error('聊天框不存在');
      }
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
            systemPrompt: '$content.systemPrompt',
            quoteLen: { $size: { $ifNull: ['$content.quote', []] } }
          }
        }
      ]);
    }

    const isOwner = String(model.userId) === userId;

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId: chatId || '',
        modelId: modelId,
        model: {
          name: model.name,
          avatar: model.avatar,
          intro: model.intro,
          canUse: model.share.isShare || isOwner
        },
        chatModel: model.chat.chatModel,
        systemPrompt: isOwner ? model.chat.systemPrompt : '',
        limitPrompt: isOwner ? model.chat.limitPrompt : '',
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
