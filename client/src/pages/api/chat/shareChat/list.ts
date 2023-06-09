import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ShareChat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { hashPassword } from '@/service/utils/tools';

/* get shareChat list by modelId */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { modelId } = req.query as {
      modelId: string;
    };

    await connectToDatabase();

    const { userId } = await authUser({ req, authToken: true });

    const data = await ShareChat.find({
      modelId,
      userId
    }).sort({
      _id: -1
    });

    const blankPassword = hashPassword('');

    jsonRes(res, {
      data: data.map((item) => ({
        _id: item._id,
        name: item.name,
        password: item.password === blankPassword ? '' : '1',
        tokens: item.tokens,
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
