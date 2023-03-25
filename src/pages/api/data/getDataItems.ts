import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, DataItem } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let {
      dataId,
      pageNum = 1,
      pageSize = 10
    } = req.query as { dataId: string; pageNum: string; pageSize: string };
    pageNum = +pageNum;
    pageSize = +pageSize;

    if (!dataId) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const { authorization } = req.headers;

    await authToken(authorization);

    const dataItems = await DataItem.find({
      dataId
    })
      .sort({ _id: -1 }) // 按照创建时间倒序排列
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize);

    jsonRes(res, {
      data: {
        pageNum,
        pageSize,
        data: dataItems,
        total: await DataItem.countDocuments({
          dataId,
          status: 0
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
