// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@fastgpt/support/user/auth';
import { MongoUser } from '@fastgpt/support/user/schema';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { userId } = await authUser({ req, authToken: true });

    // 根据 id 获取用户信息
    const user = await MongoUser.findById(userId);

    if (!user) {
      throw new Error('账号异常');
    }

    jsonRes(res, {
      data: user
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
