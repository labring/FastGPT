import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, ChatWindow } from '@/service/mongo';

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { windowId, prompts } = req.body as {
      windowId: string;
      prompts: ChatItemType[];
    };

    if (!windowId || !prompts) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 存入库
    await ChatWindow.findByIdAndUpdate(windowId, {
      $push: {
        content: {
          $each: prompts.map((item) => ({
            obj: item.obj,
            value: item.value
          }))
        }
      },
      updateTime: Date.now()
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
