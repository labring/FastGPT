import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OutLink } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

/* delete a shareChat by shareChatId */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { id } = req.query as {
      id: string;
    };

    const { userId } = await authUser({ req, authToken: true });

    await OutLink.findOneAndRemove({
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
