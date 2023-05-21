import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Collection, Model } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

/* 模型收藏切换 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { modelId } = req.query as { modelId: string };

    if (!modelId) {
      throw new Error('缺少参数');
    }
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const collectionRecord = await Collection.findOne({
      userId,
      modelId
    });

    if (collectionRecord) {
      await Collection.findByIdAndRemove(collectionRecord._id);
    } else {
      await Collection.create({
        userId,
        modelId
      });
    }

    await Model.findByIdAndUpdate(modelId, {
      'share.collection': await Collection.countDocuments({ modelId })
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
