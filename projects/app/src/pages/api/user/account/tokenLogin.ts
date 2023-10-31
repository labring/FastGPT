// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUser } from '@fastgpt/service/support/user/auth';
import { connectToDatabase } from '@/service/mongo';
import { getUserDetail } from '@/service/support/user/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId, tmbId } = await authUser({ req, authToken: true });

    jsonRes(res, {
      data: await getUserDetail(userId, tmbId)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
