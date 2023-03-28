import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ModelData } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { modelId, answer } = req.body as {
      modelId: string;
      answer: string;
    };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();

    await ModelData.updateOne(
      {
        modelId,
        userId
      },
      {
        a: answer
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
