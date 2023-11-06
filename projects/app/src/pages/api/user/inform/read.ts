// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUserInform } from '@fastgpt/service/support/user/inform/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authCert({ req, authToken: true });

    const { id } = req.query as { id: string };

    await MongoUserInform.findOneAndUpdate(
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
