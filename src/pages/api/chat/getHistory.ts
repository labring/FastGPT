import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

/* 获取历史记录 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const data = await Chat.find(
      {
        userId
      },
      '_id title modelId updateTime latestChat'
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
