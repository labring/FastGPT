import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { Model } from '@/service/models/model';
import type { ModelUpdateParams } from '@/types/model';
import { authModel } from '@/service/utils/auth';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { name, avatar, chat, share, intro } = req.body as ModelUpdateParams;
    const { modelId } = req.query as { modelId: string };

    if (!modelId) {
      throw new Error('参数错误');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    await authModel({
      modelId,
      userId
    });

    // 更新模型
    await Model.updateOne(
      {
        _id: modelId,
        userId
      },
      {
        name,
        avatar,
        intro,
        chat,
        ...(share && {
          'share.isShare': share.isShare,
          'share.isShareDetail': share.isShareDetail
        })
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
