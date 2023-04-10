import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { generateVector } from '@/service/events/generateVector';
import { vectorToBuffer, formatVector } from '@/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataPrefix, ModelDataStatusEnum } from '@/constants/redis';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId, data } = req.body as {
      modelId: string;
      data: string[][];
    };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!modelId || !Array.isArray(data)) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();
    const redis = await connectRedis();

    // 验证是否是该用户的 model
    const model = await Model.findOne({
      _id: modelId,
      userId
    });

    if (!model) {
      throw new Error('无权操作该模型');
    }

    // 插入 redis
    const insertRedisRes = await Promise.allSettled(
      data.map((item) => {
        return redis.sendCommand([
          'HMSET',
          `${VecModelDataPrefix}:${nanoid()}`,
          'userId',
          userId,
          'modelId',
          String(modelId),
          'q',
          item[0],
          'text',
          item[1],
          'status',
          ModelDataStatusEnum.waiting
        ]);
      })
    );

    generateVector();

    jsonRes(res, {
      data: insertRedisRes.filter((item) => item.status === 'rejected').length
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
