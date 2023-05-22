// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Bill } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { adaptBill } from '@/utils/adapt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { pageNum = 1, pageSize = 10 } = req.query as { pageNum: string; pageSize: string };

    pageNum = +pageNum;
    pageSize = +pageSize;

    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    // 根据 id 获取用户账单
    const bills = await Bill.find({
      userId
    })
      .sort({ _id: -1 }) // 按照创建时间倒序排列
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize);

    // 获取total
    const total = await Bill.countDocuments({
      userId
    });

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: bills.map(adaptBill),
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
