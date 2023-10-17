import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoOutLink } from '@fastgpt/support/outLink/schema';
import { authUser } from '@fastgpt/support/user/auth';

/* get shareChat list by appId */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { appId } = req.query as {
      appId: string;
    };

    const { userId } = await authUser({ req, authToken: true });

    const data = await MongoOutLink.find({
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
