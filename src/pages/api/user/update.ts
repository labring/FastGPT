// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { UserUpdateParams } from '@/types/user';

/* 更新一些基本信息 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { openaiKey } = req.body as UserUpdateParams;
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    const userId = await authToken(authorization);

    await connectToDatabase();

    // 更新对应的记录
    await User.updateOne(
      {
        _id: userId
      },
      {
        openaiKey
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
