import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Collection, App } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

/* 模型收藏切换 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { appId } = req.query as { appId: string };

    if (!appId) {
      throw new Error('缺少参数');
    }
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const collectionRecord = await Collection.findOne({
      userId,
      modelId: appId
    });

    if (collectionRecord) {
      await Collection.findByIdAndRemove(collectionRecord._id);
    } else {
      await Collection.create({
        userId,
        modelId: appId
      });
    }

    await App.findByIdAndUpdate(appId, {
      'share.collection': await Collection.countDocuments({ modelId: appId })
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
