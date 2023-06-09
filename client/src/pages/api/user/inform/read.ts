// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Inform } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const { id } = req.query as { id: string };

    await Inform.findOneAndUpdate(
      {
        _id: id,
        userId
      },
      {
        read: true
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res);
  }
}
