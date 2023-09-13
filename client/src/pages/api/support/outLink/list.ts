import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, OutLink } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { hashPassword } from '@/service/utils/tools';

/* get shareChat list by appId */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { appId } = req.query as {
      appId: string;
    };

    const { userId } = await authUser({ req, authToken: true });

    const data = await OutLink.find({
      appId,
      userId
    }).sort({
      _id: -1
    });

    jsonRes(res, { data });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
