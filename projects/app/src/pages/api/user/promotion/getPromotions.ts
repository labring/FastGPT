import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { MongoPromotionRecord } from '@fastgpt/service/support/activity/promotion/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    let { pageNum = 1, pageSize = 10 } = req.body as {
      pageNum: number;
      pageSize: number;
    };

    const { userId } = await authUser({ req, authToken: true });

    const data = await MongoPromotionRecord.find(
      {
        userId
      },
      '_id createTime type amount'
    )
      .sort({ _id: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize);

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data,
        total: await MongoPromotionRecord.countDocuments({
          userId
        })
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
