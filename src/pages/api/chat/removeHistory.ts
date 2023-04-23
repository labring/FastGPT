import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';

/* 获取历史记录 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;
    const userId = await authToken(req.headers.authorization);

    await connectToDatabase();

    await Chat.findOneAndRemove({
      _id: id,
      userId
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
