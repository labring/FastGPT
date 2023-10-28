// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUserInform } from '@fastgpt/service/support/user/inform/schema';
import { authUser } from '@fastgpt/service/support/user/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    if (!req.headers.cookie) {
      return jsonRes(res, {
        data: 0
      });
    }
    const { userId } = await authUser({ req, authToken: true });

    const data = await MongoUserInform.countDocuments({
      userId,
      read: false
    });

    jsonRes(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      data: 0
    });
  }
}
