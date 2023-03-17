import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import type { ChatPopulate } from '@/types/mongoSchema';
import type { InitChatResponse } from '@/api/response/chat';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId } = req.query as { chatId: string };

    if (!chatId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 获取 chat 数据
    const chat = await Chat.findById<ChatPopulate>(chatId).populate({
      path: 'modelId',
      options: {
        strictPopulate: false
      }
    });

    if (!chat) {
      throw new Error('聊天框不存在');
    }

    if (chat.loadAmount > 0) {
      await Chat.updateOne(
        {
          _id: chat._id
        },
        {
          $inc: { loadAmount: -1 }
        }
      );
    }

    const model = chat.modelId;
    jsonRes<InitChatResponse>(res, {
      code: 201,
      data: {
        chatId: chat._id,
        isExpiredTime: chat.loadAmount === 0 || chat.expiredTime <= Date.now(),
        modelId: model._id,
        name: model.name,
        avatar: model.avatar,
        secret: model.security,
        chatModel: model.service.chatModel,
        history: chat.content
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
