import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { Model } from '@/service/models/model';

/* 获取模型列表 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    // 根据 userId 获取模型信息
    const models = await Model.find({
      userId
    }).sort({
      _id: -1
    });

    jsonRes(res, {
      data: models
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
