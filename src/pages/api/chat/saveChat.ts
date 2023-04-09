import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat } from '@/service/mongo';

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, prompts } = req.body as {
      chatId: string;
      prompts: ChatItemType[];
    };

    if (!chatId || !prompts) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 存入库
    await Chat.findByIdAndUpdate(chatId, {
      $push: {
        content: {
          $each: prompts.map((item) => ({
            obj: item.obj,
            value: item.value
          }))
        }
      },
      updateTime: new Date()
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
