// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Inform, connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });

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
