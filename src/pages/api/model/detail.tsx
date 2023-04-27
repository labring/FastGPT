import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { authModel } from '@/service/utils/auth';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    const { modelId } = req.query as { modelId: string };

    if (!modelId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    const { model } = await authModel({
      modelId,
      userId,
      authOwner: false
    });

    jsonRes(res, {
      data: model
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
