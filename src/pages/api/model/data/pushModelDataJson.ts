import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { generateVector } from '@/service/events/generateVector';
import { vectorToBuffer, formatVector } from '@/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataPrefix, ModelDataStatusEnum, VecModelDataIdx } from '@/constants/redis';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId, data } = req.body as {
      modelId: string;
      data: { prompt: string; completion: string; vector?: number[] }[];
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
    // 支持异步的filter
    const asyncFilter = async (arr, predicate) => {
      const results = await Promise.all(arr.map(predicate));

      return arr.filter((_v, index) => results[index]);
    };
    let filterData = await asyncFilter(data, async (item) => {
      // 从 redis 中获取数据
      const searchRes = await redis.ft.search(
        VecModelDataIdx,
        `@q:${item.prompt} @text:${item.completion}`,
        {
          RETURN: ['q', 'text']
        }
      );
      if (searchRes?.documents.length) {
        return false;
      }
      return true;
    });
    // 插入 redis
    const insertRedisRes = await Promise.allSettled(
      filterData.map((item) => {
        const vector = item.vector;

        return redis.sendCommand([
          'HMSET',
          `${VecModelDataPrefix}:${nanoid()}`,
          'userId',
          userId,
          'modelId',
          String(modelId),
          ...(vector ? ['vector', vectorToBuffer(formatVector(vector))] : []),
          'q',
          item.prompt,
          'text',
          item.completion,
          'status',
          vector ? ModelDataStatusEnum.ready : ModelDataStatusEnum.waiting
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
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
};
