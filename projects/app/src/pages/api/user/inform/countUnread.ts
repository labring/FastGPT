// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Inform } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!req.headers.cookie) {
      return jsonRes(res, {
        data: 0
      });
    }
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

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
