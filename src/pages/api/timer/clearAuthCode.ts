// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { AuthCode } from '@/service/models/authCode';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('不是开发环境');
  }
  try {
    await connectToDatabase();

    const authCode = await AuthCode.deleteMany({
      expiredTime: { $lt: Date.now() }
    });

    jsonRes(res, {
      message: `删除了${authCode.deletedCount}条记录`
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
