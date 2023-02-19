// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { User } from '@/service/models/user';
import { authToken } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('缺少参数');
    }

    const userId = await authToken(authorization);

    await connectToDatabase();

    // 根据 id 获取用户信息
    const user = await User.findById(userId);

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
