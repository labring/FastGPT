import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ModelData } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';
import { connectRedis } from '@/service/redis';
import { VecModelDataIndex } from '@/constants/redis';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { dataId } = req.query as {
      dataId: string;
    };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }

    if (!dataId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const userId = await authToken(authorization);

    await connectToDatabase();
    const redis = await connectRedis();

    const data = await ModelData.findById(dataId);

    await ModelData.deleteOne({
      _id: dataId,
      userId
    });

    // 删除 redis 数据
    data?.q.forEach(async (item) => {
      try {
        await redis.json.del(`${VecModelDataIndex}:${item.id}`);
      } catch (error) {
        console.log(error);
      }
    });

    jsonRes(res);
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
