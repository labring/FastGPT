// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Inform } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    const { pageNum, pageSize = 10 } = req.body as {
      pageNum: number;
      pageSize: number;
    };

    await connectToDatabase();

    const [informs, total] = await Promise.all([
      Inform.find({ userId })
        .sort({ time: -1 }) // 按照创建时间倒序排列
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
      Inform.countDocuments({ userId })
    ]);

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: informs,
        total
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
