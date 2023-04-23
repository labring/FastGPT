import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat, Model } from '@/service/mongo';
import type { InitChatResponse } from '@/api/response/chat';
import { authToken } from '@/service/utils/tools';
import { ChatItemType } from '@/types/chat';
import { authModel } from '@/service/utils/auth';

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
    const { model } = await authModel(modelId, userId);

    // 历史记录
    let history: ChatItemType[] = [];

    if (chatId) {
      // 获取 chat 数据
      const chat = await Chat.findOne({
        _id: chatId,
        userId,
        modelId
      });

      if (!chat) {
        throw new Error('聊天框不存在');
      }

      // filter 被 deleted 的内容
      history = chat.content.filter((item) => item.deleted !== true);
    }

    jsonRes<InitChatResponse>(res, {
      data: {
        chatId: chatId || '',
        modelId: modelId,
        name: model.name,
        avatar: model.avatar,
        intro: model.intro,
        modelName: model.service.modelName,
        chatModel: model.service.chatModel,
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
