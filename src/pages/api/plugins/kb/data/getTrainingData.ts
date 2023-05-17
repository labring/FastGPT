import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { ModelDataStatusEnum } from '@/constants/model';
import { PgClient } from '@/service/pg';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { kbId } = req.query as { kbId: string };
    if (!kbId) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const userId = await authToken(req);

    // split queue data
    const data = await SplitData.find({
      userId,
      kbId,
      textList: { $exists: true, $not: { $size: 0 } }
    });

    // embedding queue data
    const embeddingData = await PgClient.count('modelData', {
      where: [
        ['user_id', userId],
        'AND',
        ['kb_id', kbId],
        'AND',
        ['status', ModelDataStatusEnum.waiting]
      ]
    });

    jsonRes(res, {
      data: {
        splitDataQueue: data.map((item) => item.textList).flat().length,
        embeddingQueue: embeddingData
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
