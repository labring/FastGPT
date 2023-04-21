// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, promotionRecord } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { authorization } = req.headers;
    let { pageNum = 1, pageSize = 10 } = req.query as { pageNum: string; pageSize: string };
    pageNum = +pageNum;
    pageSize = +pageSize;
    if (!authorization) {
      throw new Error('缺少登录凭证');
    }

    const userId = await authToken(authorization);

    await connectToDatabase();

    const data = await promotionRecord
      .find(
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
        total: await promotionRecord.countDocuments({
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
