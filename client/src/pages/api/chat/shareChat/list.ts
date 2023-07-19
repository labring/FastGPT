import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ShareChat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { hashPassword } from '@/service/utils/tools';

/* get shareChat list by appId */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { appId } = req.query as {
      appId: string;
    };

    await connectToDatabase();

    const { userId } = await authUser({ req, authToken: true });

    const data = await ShareChat.find({
      appId,
      userId
    }).sort({
      _id: -1
    });

    jsonRes(res, {
      data: data.map((item) => ({
        _id: item._id,
        shareId: item.shareId,
        name: item.name,
        total: item.total,
        maxContext: item.maxContext,
        lastTime: item.lastTime
      }))
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
