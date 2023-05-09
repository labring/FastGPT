import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { ModelDataStatusEnum } from '@/constants/model';
import { PgClient } from '@/service/pg';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { modelId } = req.query as { modelId: string };
    if (!modelId) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const userId = await authToken(req);

    // split queue data
    const data = await SplitData.find({
      userId,
      modelId,
      textList: { $exists: true, $not: { $size: 0 } }
    });

    // embedding queue data
    const where: any = [
      ['user_id', userId],
      'AND',
      ['model_id', modelId],
      'AND',
      ['status', ModelDataStatusEnum.waiting]
    ];

    jsonRes(res, {
      data: {
        splitDataQueue: data.map((item) => item.textList).flat().length,
        embeddingQueue: await PgClient.count('modelData', {
          where
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
