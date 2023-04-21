import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authToken } from '@/service/utils/tools';
import { connectToDatabase, Pay } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('缺少登录凭证');
    }
    const userId = await authToken(authorization);

    await connectToDatabase();

    const records = await Pay.find({
      userId,
      status: { $ne: 'CLOSED' }
    }).sort({ createTime: -1 });

    jsonRes(res, {
      data: records
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
