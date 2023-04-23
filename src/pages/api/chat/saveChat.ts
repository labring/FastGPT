import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authModel } from '@/service/utils/auth';
import { authToken } from '@/service/utils/tools';

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, modelId, prompts } = req.body as {
      chatId: '' | string;
      modelId: string;
      prompts: ChatItemType[];
    };

    if (!prompts) {
      throw new Error('缺少参数');
    }

    const userId = await authToken(req.headers.authorization);

    await connectToDatabase();

    const content = prompts.map((item) => ({
      obj: item.obj,
      value: item.value
    }));

    // 没有 chatId, 创建一个对话
    if (!chatId) {
      await authModel(modelId, userId);
      const { _id } = await Chat.create({
        userId,
        modelId,
        content
      });
      return jsonRes(res, {
        data: _id
      });
    } else {
      // 已经有记录，追加入库
      await Chat.findByIdAndUpdate(chatId, {
        $push: {
          content: {
            $each: content
          }
        },
        updateTime: new Date()
      });
    }
    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
