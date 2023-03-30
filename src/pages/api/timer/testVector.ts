// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Bill } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import type { BillSchema } from '@/types/mongoSchema';
import { VecModelDataIndex } from '@/constants/redis';
import { connectRedis } from '@/service/redis';
import { vectorToBuffer } from '@/utils/tools';

let vectorData = [
  -0.025028639, -0.010407282, 0.026523087, -0.0107438695, -0.006967359, 0.010043768, -0.012043097,
  0.008724345, -0.028919589, -0.0117738275, 0.0050690062, 0.02961969
].concat(new Array(1524).fill(0));
let vectorData2 = [
  0.025028639, 0.010407282, 0.026523087, 0.0107438695, -0.006967359, 0.010043768, -0.012043097,
  0.008724345, 0.028919589, 0.0117738275, 0.0050690062, 0.02961969
].concat(new Array(1524).fill(0));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('不是开发环境');
    }
    await connectToDatabase();

    const redis = await connectRedis();

    await redis.sendCommand([
      'HMSET',
      'model:data:333',
      'vector',
      vectorToBuffer(vectorData2),
      'modelId',
      '1133',
      'dataId',
      'safadfa'
    ]);

    // search
    const response = await redis.sendCommand([
      'FT.SEARCH',
      'idx:model:data:hash',
      '@modelId:{1133} @vector:[VECTOR_RANGE 0.15 $blob]=>{$YIELD_DISTANCE_AS: score}',
      'RETURN',
      '2',
      'modelId',
      'dataId',
      'PARAMS',
      '2',
      'blob',
      vectorToBuffer(vectorData2),
      'SORTBY',
      'score',
      'DIALECT',
      '2'
    ]);

    jsonRes(res, {
      data: response
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
