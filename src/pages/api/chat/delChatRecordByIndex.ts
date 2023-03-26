import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, index } = req.query as { chatId: string; index: string };

    if (!chatId || !index) {
      throw new Error('缺少参数');
    }
    console.log(index);
    await connectToDatabase();

    // 删除最一条数据库记录, 也就是预发送的那一条
    await Chat.findByIdAndUpdate(chatId, {
      $set: {
        [`content.${index}.deleted`]: true,
        updateTime: Date.now()
      }
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
