// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Inform, connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/support/user/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    if (!req.headers.cookie) {
      return jsonRes(res, {
        data: 0
      });
    }
    const { userId } = await authUser({ req, authToken: true });

    const data = await Inform.countDocuments({
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
