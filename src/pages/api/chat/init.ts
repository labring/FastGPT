import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat, ChatWindow } from '@/service/mongo';
import type { ModelType } from '@/types/model';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, windowId } = req.query as { chatId: string; windowId?: string };

    if (!chatId) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 获取 chat 数据
    const chat = await Chat.findById(chatId).populate({
      path: 'modelId',
      options: {
        strictPopulate: false
      }
    });

    // 安全校验
    if (chat.loadAmount === 0 || chat.expiredTime < Date.now()) {
      throw new Error('聊天框已过期');
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

    const model: ModelType = chat.modelId;

    /* 查找是否有记录 */
    let history = null;
    let responseId = windowId;
    try {
      history = await ChatWindow.findById(windowId);
    } catch (error) {
      error;
    }

    const defaultContent = model.systemPrompt
      ? [
          {
            obj: 'SYSTEM',
            value: model.systemPrompt
          }
        ]
      : [];

    if (!history) {
      // 没有记录，创建一个
      const response = await ChatWindow.create({
        chatId,
        updateTime: Date.now(),
        content: defaultContent
      });
      responseId = response._id;
    }

    jsonRes(res, {
      data: {
        windowId: responseId,
        chatSite: {
          modelId: model._id,
          name: model.name,
          avatar: model.avatar,
          secret: model.security,
          chatModel: model.service.chatModel
        },
        history: history ? history.content : defaultContent
      }
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
