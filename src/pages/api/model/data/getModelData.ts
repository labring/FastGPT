import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ModelData } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let {
      modelId,
      pageNum = 1,
      pageSize = 10
    } = req.query as {
      modelId: string;
      pageNum: string;
      pageSize: string;
    };
    const { authorization } = req.headers;

    pageNum = +pageNum;
    pageSize = +pageSize;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    const data = await ModelData.find({
      modelId,
      userId
    })
      .sort({ _id: -1 }) // 按照创建时间倒序排列
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize);

    jsonRes(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
