import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';

/* 获取历史记录 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const userId = await authToken(req.headers.authorization);

    await connectToDatabase();

    const data = await Chat.find(
      {
        userId
      },
      '_id title modelId'
    )
      .sort({ updateTime: -1 })
      .limit(20);

    jsonRes(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
