// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Bill, connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/support/user/auth';
import { adaptBill } from '@/utils/adapt';
import { addDays } from 'date-fns';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const {
      pageNum = 1,
      pageSize = 10,
      dateStart = addDays(new Date(), -7),
      dateEnd = new Date()
    } = req.body as {
      pageNum: number;
      pageSize: number;
      dateStart: Date;
      dateEnd: Date;
    };

    const { userId } = await authUser({ req, authToken: true });

    const where = {
      userId,
      time: {
        $gte: dateStart,
        $lte: dateEnd
      }
    };

    // get bill record and total by record
    const [bills, total] = await Promise.all([
      Bill.find(where)
        .sort({ time: -1 }) // 按照创建时间倒序排列
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
      Bill.countDocuments(where)
    ]);

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
