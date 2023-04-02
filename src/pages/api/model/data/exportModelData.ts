import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataIdx } from '@/constants/redis';
import { BufferToVector } from '@/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { modelId } = req.query as {
      modelId: string;
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
    const redis = await connectRedis();

    // 从 redis 中获取数据
    const searchRes = await redis.ft.search(
      VecModelDataIdx,
      `@modelId:{${modelId}} @userId:{${userId}}`,
      {
        RETURN: ['q', 'text', 'vector'],
        LIMIT: {
          from: 0,
          size: 10000
        }
      }
    );

    const data = searchRes.documents
      .filter((item) => item?.value?.vector)
      .map((item: any) => ({
        prompt: item.value.q,
        completion: item.value.text,
        vector: BufferToVector(item.value.vector)
      }));

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
