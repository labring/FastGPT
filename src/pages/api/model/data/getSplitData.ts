import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, SplitData, Model } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';

/* 拆分数据成QA */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { modelId } = req.query as { modelId: string };
    if (!modelId) {
      throw new Error('参数错误');
    }
    await connectToDatabase();

    const userId = await authToken(req);

    // 找到长度大于0的数据
    const data = await SplitData.find({
      userId,
      modelId,
      textList: { $exists: true, $not: { $size: 0 } }
    });

    jsonRes(res, {
      data: data.map((item) => item.textList).flat().length
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
